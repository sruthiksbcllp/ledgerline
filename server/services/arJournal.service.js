'use strict';
/**
 * AR journal engine: the receivables mirror of apJournal.service. Posts a balanced journal for
 * every Accounts Receivable event into the same ledger (journal_entries / journal_lines), so
 * receivables reach the general ledger, trial balance and statements:
 *
 *   Customer invoice     Dr Accounts receivable            Cr Sales, Cr Output IGST | CGST + SGST
 *   Receipt              Dr Bank, Dr TDS receivable        Cr Accounts receivable
 *   Invoice cancelled    reversal of the invoice journal
 *
 * Posting runs after the business transaction commits and never blocks or fails it. Each event
 * has a dedupe key ("ARINV:12", "ARRCPT:5"), unique per company, so re-running is harmless and
 * backfill() can post journals for invoices and receipts recorded before the engine existed.
 */
const { Op } = require('sequelize');
const apJournal = require('./apJournal.service');

const SOURCE_MODULES = ['AR_INVOICE', 'AR_RECEIPT'];
const ACCOUNTS = [
  { code: '1010', name: 'Operating bank account', type: 'ASSET', description: 'Customer receipts are banked here' },
  { code: '1100', name: 'Accounts receivable – trade', type: 'ASSET', description: 'Amount owed by each customer' },
  { code: '1420', name: 'TDS receivable', type: 'ASSET', description: 'Tax deducted at source by customers, claimable against income tax' },
  { code: '2110', name: 'Output IGST', type: 'LIABILITY', description: 'GST collected on inter-state sales' },
  { code: '2111', name: 'Output CGST', type: 'LIABILITY', description: 'GST collected on intra-state sales' },
  { code: '2112', name: 'Output SGST', type: 'LIABILITY', description: 'GST collected on intra-state sales' },
  { code: '4000', name: 'Sales', type: 'INCOME', description: 'Revenue from customer invoices' }
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
  const who = receipt.invoice?.customer?.customer_name || 'customer';
  return apJournal.post({
    clientId: receipt.client_id, key: `ARRCPT:${receipt.id}`, eventType: 'AR_RECEIPT', sourceModule: 'AR_RECEIPT', sourceId: receipt.id,
    sourceRef: receipt.invoice?.invoice_number || null, date: receipt.received_date,
    narration: `Receipt from ${who} against ${receipt.invoice?.invoice_number || 'invoice'}${receipt.reference ? ` (ref ${receipt.reference})` : ''}`,
    lines: [
      line(names, '1010', cash, 0, receipt.payment_mode || 'Receipt'),
      line(names, '1420', tds, 0, 'TDS deducted by the customer'),
      line(names, '1100', 0, round2(cash + tds), who)
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

module.exports = { ACCOUNTS, SOURCE_MODULES, accountNames, invoiceLines, postInvoice, postReceipt, reverseInvoice, backfill, safely };
