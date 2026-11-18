'use strict';
/**
 * AR journal engine: the receivables mirror of apJournal.service. Posts a balanced journal for
 * every Accounts Receivable event into the same ledger (journal_entries / journal_lines), so
 * receivables reach the general ledger, trial balance and statements:
 *
 *   Customer invoice     Dr Accounts receivable            Cr Sales, Cr Output IGST | CGST + SGST
 *   Receipt              Dr Bank (or Dr Unapplied cash when applied from it), Dr TDS receivable,
 *                        Dr Sales discounts (early-payment discount)          Cr Accounts receivable
 *   Invoice cancelled    reversal of the invoice journal
 *   Credit note          Dr Sales returns & allowances, Dr Output GST          Cr Accounts receivable
 *   Unapplied cash       Dr Bank                                               Cr Unapplied cash & customer credits
 *   Credit-loss (ECL)    Dr Credit loss expense   Cr Allowance  (a release is the other way round)
 *   Write-off            Dr Allowance (up to its balance), Dr Credit loss expense  Cr Accounts receivable
 *   Write-off recovery   Dr Accounts receivable   Cr Allowance (the cash is then received normally)
 *
 * Posting runs after the business transaction commits and never blocks or fails it. Each event
 * has a dedupe key ("ARINV:12", "ARRCPT:5", "ARCN:3" ...), unique per company, so re-running is
 * harmless and backfill() can post journals for invoices and receipts recorded before the engine
 * existed. The shared posting function apJournal.post is only called, never changed.
 */
const { Op } = require('sequelize');
const apJournal = require('./apJournal.service');

const SOURCE_MODULES = ['AR_INVOICE', 'AR_RECEIPT', 'AR_CREDIT_NOTE', 'AR_UNAPPLIED', 'AR_ECL', 'AR_WRITE_OFF'];
const ACCOUNTS = [
  { code: '1010', name: 'Operating bank account', type: 'ASSET', description: 'Customer receipts are banked here' },
  { code: '1100', name: 'Accounts receivable – trade', type: 'ASSET', description: 'Amount owed by each customer' },
  { code: '1105', name: 'Allowance for credit losses', type: 'ASSET', description: 'Contra-asset: expected credit loss on receivables (Ind AS 109)' },
  { code: '1420', name: 'TDS receivable', type: 'ASSET', description: 'Tax deducted at source by customers, claimable against income tax' },
  { code: '2060', name: 'Unapplied cash and customer credits', type: 'LIABILITY', description: 'Customer money not yet matched to an invoice, and overpayments' },
  { code: '2110', name: 'Output IGST', type: 'LIABILITY', description: 'GST collected on inter-state sales' },
  { code: '2111', name: 'Output CGST', type: 'LIABILITY', description: 'GST collected on intra-state sales' },
  { code: '2112', name: 'Output SGST', type: 'LIABILITY', description: 'GST collected on intra-state sales' },
  { code: '4000', name: 'Sales', type: 'INCOME', description: 'Revenue from customer invoices' },
  { code: '4050', name: 'Sales returns and allowances', type: 'INCOME', description: 'Contra-revenue: credit notes for damage, pricing, short shipment and returns' },
  { code: '4060', name: 'Sales discounts', type: 'INCOME', description: 'Contra-revenue: early-payment (cash) discounts allowed to customers' },
  { code: '6900', name: 'Credit loss expense', type: 'EXPENSE', description: 'Expected credit loss provision and bad debts written off' }
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
let models = null;
const m = () => models || (models = require('../models'));

/** Account names as this company's chart has them (its own name wins if the code already exists). */
async function accountNames(clientId) {
  const { GlAccount } = m();
  const have = await GlAccount.findAll({ where: { client_id: clientId, code: ACCOUNTS.map((a) => a.code) }, attributes: ['code', 'name'] });
  const names = Object.fromEntries(have.map((a) => [a.code, a.name]));
  const missing = ACCOUNTS.filter((a) => !names[a.code]).map((a) => ({ ...a, client_id: clientId }));
  if (missing.length) await GlAccount.bulkCreate(missing, { ignoreDuplicates: true });
  return Object.fromEntries(ACCOUNTS.map((a) => [a.code, names[a.code] || a.name]));
}

const line = (names, account, debit, credit, memo) => ({ account, accountName: names[account], debit, credit, memo });

/** Lines of the invoice journal (also used for the preview shown before posting). */
function invoiceLines(names, invoice, customerName) {
  const total = round2(invoice.total_amount);
  const igst = round2(invoice.igst_amount);
  const cgst = round2(invoice.cgst_amount);
  const sgst = round2(invoice.sgst_amount);
  // Invoices recorded before the GST split existed carry only tax_amount: show it as IGST.
  const unsplit = round2(Number(invoice.tax_amount) - igst - cgst - sgst);
  const sales = round2(total - igst - cgst - sgst - Math.max(0, unsplit));
  return [
    line(names, '1100', total, 0, customerName),
    line(names, '4000', 0, sales, `Invoice ${invoice.invoice_number}`),
    line(names, '2110', 0, round2(igst + Math.max(0, unsplit)), 'Output IGST'),
    line(names, '2111', 0, cgst, 'Output CGST'),
    line(names, '2112', 0, sgst, 'Output SGST')
  ];
}

async function postInvoice(invoiceId) {
  const { ArInvoice, ArCustomer } = m();
  const invoice = await ArInvoice.findByPk(invoiceId, { include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }] });
  if (!invoice || invoice.status === 'CANCELLED') return null;
  const names = await accountNames(invoice.client_id);
  return apJournal.post({
    clientId: invoice.client_id, key: `ARINV:${invoice.id}`, eventType: 'AR_INVOICE', sourceModule: 'AR_INVOICE', sourceId: invoice.id,
    sourceRef: invoice.invoice_number, date: invoice.invoice_date,
    narration: `Customer invoice ${invoice.invoice_number} – ${invoice.customer?.customer_name || 'customer'}`,
    lines: invoiceLines(names, invoice, invoice.customer?.customer_name)
  });
}

/** Payment banked before it is matched to an invoice: Dr Bank, Cr Unapplied cash. */
async function postUnapplied(unappliedId) {
  const { ArUnappliedCash, ArCustomer } = m();
  const u = await ArUnappliedCash.findByPk(unappliedId, { include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }] });
  if (!u) return null;
  const names = await accountNames(u.client_id);
  const who = u.customer?.customer_name || u.payer_name || 'unidentified payer';
  return apJournal.post({
    clientId: u.client_id, key: `ARUNAP:${u.id}`, eventType: 'AR_UNAPPLIED_CASH', sourceModule: 'AR_UNAPPLIED', sourceId: u.id,
    sourceRef: u.reference || null, date: u.received_date,
    narration: `Payment received, not yet applied – ${who}${u.reference ? ` (ref ${u.reference})` : ''}`,
    lines: [line(names, '1010', round2(u.amount), 0, u.payment_mode || 'Receipt'), line(names, '2060', 0, round2(u.amount), 'Held until matched to an invoice')]
  });
}

async function postReceipt(receiptId) {
  const { ArReceipt, ArInvoice, ArCustomer } = m();
  const receipt = await ArReceipt.findByPk(receiptId, {
    include: [{ model: ArInvoice, as: 'invoice', include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }] }]
  });
  if (!receipt) return null;
  await postInvoice(receipt.invoice_id); // the receivable must exist before it is cleared
  const names = await accountNames(receipt.client_id);
  const cash = round2(receipt.amount);
  const tds = round2(receipt.tds_amount);
  const discount = round2(receipt.discount_amount);
  const who = receipt.invoice?.customer?.customer_name || 'customer';
  // Money applied from unapplied cash was banked when it arrived: it now leaves 2060, not the bank.
  const fromUnapplied = !!receipt.unapplied_id;
  if (fromUnapplied) await postUnapplied(receipt.unapplied_id);
  return apJournal.post({
    clientId: receipt.client_id, key: `ARRCPT:${receipt.id}`, eventType: fromUnapplied ? 'AR_UNAPPLIED_APPLIED' : 'AR_RECEIPT', sourceModule: 'AR_RECEIPT', sourceId: receipt.id,
    sourceRef: receipt.invoice?.invoice_number || null, date: receipt.received_date,
    narration: fromUnapplied
      ? `Unapplied cash applied to ${receipt.invoice?.invoice_number || 'invoice'} – ${who}`
      : `Receipt from ${who} against ${receipt.invoice?.invoice_number || 'invoice'}${receipt.reference ? ` (ref ${receipt.reference})` : ''}`,
    lines: [
      fromUnapplied ? line(names, '2060', cash, 0, 'Applied from unapplied cash') : line(names, '1010', cash, 0, receipt.payment_mode || 'Receipt'),
      line(names, '1420', tds, 0, 'TDS deducted by the customer'),
      line(names, '4060', discount, 0, 'Early-payment discount allowed'),
      line(names, '1100', 0, round2(cash + tds + discount), who)
    ]
  });
}

/** Reverses the invoice journal when an invoice is cancelled (no-op if it was never posted). */
async function reverseInvoice(invoiceId) {
  const { ArInvoice, JournalEntry, JournalLine } = m();
  const invoice = await ArInvoice.findByPk(invoiceId);
  if (!invoice) return null;
  const original = await JournalEntry.findOne({
    where: { client_id: invoice.client_id, dedupe_key: `ARINV:${invoice.id}` },
    include: [{ model: JournalLine, as: 'lines' }]
  });
  if (!original) return null;
  return apJournal.post({
    clientId: invoice.client_id, key: `ARINVREV:${invoice.id}`, eventType: 'AR_INVOICE_CANCEL', sourceModule: 'AR_INVOICE', sourceId: invoice.id,
    sourceRef: invoice.invoice_number, date: new Date(), narration: `Cancelled customer invoice ${invoice.invoice_number}`,
    reversalOfId: original.id,
    lines: original.lines.map((l) => ({ account: l.account_code, accountName: l.account_name, debit: l.credit, credit: l.debit, memo: l.memo }))
  });
}

/** Lines of a credit note: reverse the sale and its GST, reduce what the customer owes. */
function creditNoteLines(names, note, customerName) {
  return [
    line(names, '4050', round2(note.subtotal), 0, `${note.reason_code}: ${note.credit_note_number || 'credit note'}`),
    line(names, '2110', round2(note.igst_amount), 0, 'Output IGST reversed'),
    line(names, '2111', round2(note.cgst_amount), 0, 'Output CGST reversed'),
    line(names, '2112', round2(note.sgst_amount), 0, 'Output SGST reversed'),
    line(names, '1100', 0, round2(note.total_amount), customerName)
  ];
}

async function postCreditNote(noteId) {
  const { ArCreditNote, ArCustomer, ArInvoice } = m();
  const note = await ArCreditNote.findByPk(noteId, {
    include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }, { model: ArInvoice, as: 'invoice', attributes: ['invoice_number'] }]
  });
  if (!note || note.status !== 'APPROVED') return null;
  await postInvoice(note.invoice_id);
  const names = await accountNames(note.client_id);
  return apJournal.post({
    clientId: note.client_id, key: `ARCN:${note.id}`, eventType: 'AR_CREDIT_NOTE', sourceModule: 'AR_CREDIT_NOTE', sourceId: note.id,
    sourceRef: note.credit_note_number, date: note.credit_date,
    narration: `Credit note ${note.credit_note_number} against ${note.invoice?.invoice_number || 'invoice'} – ${note.customer?.customer_name || 'customer'}`,
    lines: creditNoteLines(names, note, note.customer?.customer_name)
  });
}

/** Month-end ECL: top up (Dr expense, Cr allowance) or release (the other way round). */
async function postEcl(runId) {
  const { ArEclRun } = m();
  const run = await ArEclRun.findByPk(runId);
  if (!run || run.status !== 'POSTED') return null;
  const names = await accountNames(run.client_id);
  const adj = round2(run.adjustment);
  const topUp = adj > 0;
  return apJournal.post({
    clientId: run.client_id, key: `ARECL:${run.id}`, eventType: topUp ? 'AR_ECL_TOP_UP' : 'AR_ECL_RELEASE', sourceModule: 'AR_ECL', sourceId: run.id,
    sourceRef: `ECL ${run.period}`, date: run.as_of,
    narration: `${topUp ? 'Top up' : 'Release'} allowance for credit losses to ${round2(run.required)} (${run.period})`,
    lines: topUp
      ? [line(names, '6900', adj, 0, 'Increase to required allowance'), line(names, '1105', 0, adj, `Allowance now ${round2(run.required)}`)]
      : [line(names, '1105', -adj, 0, `Allowance now ${round2(run.required)}`), line(names, '6900', 0, -adj, 'Release of allowance no longer needed')]
  });
}

async function postWriteOff(writeOffId) {
  const { ArWriteOff, ArCustomer, ArInvoice } = m();
  const wo = await ArWriteOff.findByPk(writeOffId, {
    include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }, { model: ArInvoice, as: 'invoice', attributes: ['invoice_number'] }]
  });
  if (!wo || wo.status !== 'APPROVED') return null;
  await postInvoice(wo.invoice_id);
  const names = await accountNames(wo.client_id);
  return apJournal.post({
    clientId: wo.client_id, key: `ARWO:${wo.id}`, eventType: 'AR_WRITE_OFF', sourceModule: 'AR_WRITE_OFF', sourceId: wo.id,
    sourceRef: wo.write_off_number, date: wo.approved_at || new Date(),
    narration: `Write off ${wo.invoice?.invoice_number || 'invoice'} – ${wo.customer?.customer_name || 'customer'} (${wo.write_off_number})`,
    lines: [
      line(names, '1105', round2(wo.allowance_used), 0, 'Use allowance'),
      line(names, '6900', round2(wo.expense_amount), 0, 'Not covered by the allowance'),
      line(names, '1100', 0, round2(wo.amount), 'Remove uncollectible balance')
    ]
  });
}

/** A recovery on a written-off invoice reinstates the receivable; `seq` numbers each recovery. */
async function postWriteOffRecovery(writeOffId, seq, amount, date) {
  const { ArWriteOff } = m();
  const wo = await ArWriteOff.findByPk(writeOffId);
  if (!wo) return null;
  const names = await accountNames(wo.client_id);
  return apJournal.post({
    clientId: wo.client_id, key: `ARWOREC:${wo.id}:${seq}`, eventType: 'AR_WRITE_OFF_RECOVERY', sourceModule: 'AR_WRITE_OFF', sourceId: wo.id,
    sourceRef: wo.write_off_number, date,
    narration: `Recovery on written-off ${wo.write_off_number}: receivable reinstated`,
    lines: [line(names, '1100', round2(amount), 0, 'Receivable reinstated'), line(names, '1105', 0, round2(amount), 'Allowance restored')]
  });
}

/** Balance of one ledger account for a company (debit minus credit), from every posted journal. */
async function accountBalance(clientId, code, { upTo = null } = {}) {
  const { JournalLine, JournalEntry } = m();
  const rows = await JournalLine.findAll({
    where: { client_id: clientId, account_code: code }, attributes: ['debit', 'credit'],
    include: [{ model: JournalEntry, as: 'entry', attributes: [], where: { client_id: clientId, ...(upTo ? { entry_date: { [Op.lte]: upTo } } : {}) }, required: true }],
    raw: true
  });
  return round2(rows.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0));
}

/** Runs a posting after the response path; a posting failure is logged, never thrown. */
function safely(label, fn) {
  return Promise.resolve().then(fn).catch((e) => { console.error(`[arJournal] ${label} failed:`, e.message); return null; });
}

/** Posts journals for every invoice and receipt of the company that has none yet. */
async function backfill(clientId) {
  const { ArInvoice, ArReceipt } = m();
  const invoices = await ArInvoice.findAll({ where: { client_id: clientId, status: { [Op.ne]: 'CANCELLED' } }, attributes: ['id'], order: [['id', 'ASC']] });
  let posted = 0;
  for (const inv of invoices) if (await safely(`invoice ${inv.id}`, () => postInvoice(inv.id))) posted += 1;
  const receipts = await ArReceipt.findAll({ where: { client_id: clientId }, attributes: ['id'], order: [['id', 'ASC']] });
  for (const r of receipts) if (await safely(`receipt ${r.id}`, () => postReceipt(r.id))) posted += 1;
  return posted;
}

module.exports = {
  ACCOUNTS, SOURCE_MODULES, accountNames, invoiceLines, creditNoteLines, postInvoice, postReceipt, postUnapplied, reverseInvoice,
  postCreditNote, postEcl, postWriteOff, postWriteOffRecovery, accountBalance, backfill, safely
};
