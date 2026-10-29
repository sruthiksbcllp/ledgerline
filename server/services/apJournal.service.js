'use strict';
/**
 * AP journal engine. Posts a balanced journal for every Accounts Payable event, following the
 * user's "Accounts Payable — Journal Entry Reference" (perpetual system with GR/IR clearing) and
 * the P2P blueprint's chart of accounts:
 *
 *   Goods receipt (GRN)     Dr Inventory / Capital WIP / Consumables   Cr GR/IR clearing      (ref 1.2–1.4)
 *   Service receipt (SES)   Dr Contract services / Capital WIP          Cr GR/IR clearing
 *   Invoice                 Dr GR/IR (+ PPV), Dr Input CGST/SGST/IGST   Cr Vendor (net of TDS), Cr TDS payable  (ref 2.1–2.6)
 *                           no receipt on the PO: Dr the expense directly; GST not creditable: GST into the cost (ref 3.4)
 *   Payment                 Dr Vendor                                   Cr Bank                (ref 5.1–5.2)
 *   Advance on a PO         Dr Advances to vendors                      Cr Bank                (ref 4.1–4.2)
 *                           adjusted on the PO's invoices: Cr Advances to vendors, Vendor credit reduced
 *   Return before invoice   Dr GR/IR clearing                           Cr Inventory / Expense (ref 1.5)
 *   Return after invoice    Dr Vendor                                   Cr Inventory / Expense, Cr Input GST (ref 4.3)
 *   Invoice rejected        reversal of the invoice journal (and of returns posted against it)
 *
 * Posting runs after the business transaction commits and never blocks or fails it. Each event
 * has a dedupe key ("GRN:12", "INVOICE:40"), unique per company, so re-running is harmless and
 * backfill() can rebuild journals for documents that existed before the engine.
 */
const { Op } = require('sequelize');
const requestContext = require('../utils/requestContext');

const ACCOUNTS = [
  { code: '1010', name: 'Operating bank account', type: 'ASSET', description: 'Vendor payments are paid from here' },
  { code: '1200', name: 'Inventory', type: 'ASSET', description: 'Goods received for stock' },
  { code: '1300', name: 'Advances to vendors', type: 'ASSET', description: 'Paid to vendors ahead of their invoice' },
  { code: '1410', name: 'Input IGST', type: 'ASSET', description: 'GST input tax credit – inter-state and imports' },
  { code: '1411', name: 'Input CGST', type: 'ASSET', description: 'GST input tax credit – intra-state' },
  { code: '1412', name: 'Input SGST', type: 'ASSET', description: 'GST input tax credit – intra-state' },
  { code: '1500', name: 'Capital work-in-progress / Fixed assets', type: 'ASSET', description: 'Capex receipts' },
  { code: '2010', name: 'Accounts payable – trade', type: 'LIABILITY', description: 'Amount owed to each vendor' },
  { code: '2015', name: 'GR/IR clearing', type: 'LIABILITY', description: 'Received, not yet invoiced' },
  { code: '2160', name: 'TDS payable', type: 'LIABILITY', description: 'Tax deducted at source, due to government' },
  { code: '5010', name: 'Purchase price variance', type: 'EXPENSE', description: 'Invoice above the received value' },
  { code: '6350', name: 'Contract services expense', type: 'EXPENSE', description: 'Opex services received on an SES' },
  { code: '6800', name: 'Consumables & office supplies', type: 'EXPENSE', description: 'Opex goods received' }
];
const NAME = Object.fromEntries(ACCOUNTS.map((a) => [a.code, a.name]));

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Posting date in India time (the server runs in UTC); 'YYYY-MM-DD' values are already dates.
const IST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const dateOnly = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const x = d ? new Date(d) : new Date();
  return IST_DATE.format(Number.isNaN(x.getTime()) ? new Date() : x);
};
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/**
 * TDS actually deducted on an invoice: only when a TDS section applies (vendor master or invoice),
 * and not when the vendor was paid more than the net amount — invoices paid gross before payments
 * were capped at the net had nothing withheld.
 */
const tdsOf = (inv) => {
  if (!inv || !inv.tds_section_code) return 0;
  const tds = round2(inv.tds_amount);
  return Number(inv.paid_amount || 0) > round2(Number(inv.total_amount || 0) - tds) + 0.009 ? 0 : tds;
};
/**
 * What the vendor is owed: invoice total less TDS (the TDS goes to the government), less the PO
 * advance set off, less goods returned after the invoice.
 */
const netPayableOf = (inv) => round2(Number(inv?.total_amount || 0) - tdsOf(inv) - Number(inv?.advance_adjusted || 0) - Number(inv?.returns_credit || 0));

/** Receipt account for a PO: capex to Capital WIP, opex goods to consumables, services to services expense. */
const receiptAccount = (po, kind) => {
  if (po?.type === 'CAPEX') return '1500';
  if (kind === 'SERVICE') return '6350';
  return po?.type === 'OPEX' ? '6800' : '1200';
};

/** Accounts a receipt on this PO posts to (shown on the GRN / SES screens before submitting). */
const receiptAccountsFor = (po, kind = 'GOODS') => {
  const code = receiptAccount(po, kind);
  return { debit: { code, name: NAME[code] }, credit: { code: '2015', name: NAME['2015'] } };
};

let models = null;
const m = () => models || (models = require('../models'));

async function ensureAccounts(clientId, transaction) {
  const { GlAccount } = m();
  const have = await GlAccount.findAll({ where: { client_id: clientId }, attributes: ['code'], transaction });
  const codes = new Set(have.map((a) => a.code));
  const missing = ACCOUNTS.filter((a) => !codes.has(a.code)).map((a) => ({ ...a, client_id: clientId }));
  if (missing.length) await GlAccount.bulkCreate(missing, { transaction, ignoreDuplicates: true });
}

async function actorNow() {
  try {
    const { resolveActor } = require('./workflowTrail.service');
    const a = await resolveActor(m(), null, requestContext.current()?.actor?.client_id);
    return { posted_by: a.user_id, posted_by_name: a.user_name, posted_by_role: a.role_name };
  } catch {
    return { posted_by: null, posted_by_name: 'System', posted_by_role: 'Automated' };
  }
}

/**
 * Write one journal. lines: [{ account, debit, credit, memo }]. Zero lines are dropped, and the
 * journal is refused unless debits equal credits. Returns the entry, or null when already posted.
 */
async function post({ clientId, key, eventType, sourceModule, sourceId, sourceRef, date, vendorId, poId, invoiceId, narration, lines, source = 'AUTO', reversalOfId = null }) {
  const { JournalEntry, JournalLine, sequelize } = m();
  const clean = lines
    .map((l) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit) }))
    .filter((l) => l.debit > 0 || l.credit > 0);
  if (!clean.length) return null;
  const dr = round2(clean.reduce((s, l) => s + l.debit, 0));
  const cr = round2(clean.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(dr - cr) > 0.009) throw new Error(`Unbalanced journal ${key}: Dr ${dr} / Cr ${cr}`);
  if (await JournalEntry.findOne({ where: { client_id: clientId, dedupe_key: key }, attributes: ['id'] })) return null;

  const who = source === 'BACKFILL' ? { posted_by: null, posted_by_name: 'System', posted_by_role: 'Backfill' } : await actorNow();
  try {
    return await sequelize.transaction(async (transaction) => {
      await ensureAccounts(clientId, transaction);
      const entry = await JournalEntry.create({
        client_id: clientId, entry_date: dateOnly(date), event_type: eventType, source_module: sourceModule, source_id: sourceId,
        source_ref: sourceRef || null, dedupe_key: key, vendor_id: vendorId || null, po_id: poId || null, invoice_id: invoiceId || null,
        narration: narration ? String(narration).slice(0, 500) : null, total_debit: dr, total_credit: cr, status: 'POSTED',
        reversal_of_id: reversalOfId, source, ...who
      }, { transaction });
      await entry.update({ je_number: `JE-${entry.entry_date.slice(0, 4)}-${String(entry.id).padStart(5, '0')}` }, { transaction });
      await JournalLine.bulkCreate(clean.map((l, i) => ({
        client_id: clientId, journal_entry_id: entry.id, line_no: i + 1, account_code: l.account,
        account_name: l.accountName || NAME[l.account] || l.account, debit: l.debit, credit: l.credit,
        memo: l.memo ? String(l.memo).slice(0, 255) : null, vendor_id: vendorId || null
      })), { transaction });
      return entry;
    });
  } catch (e) {
    if (e?.name === 'SequelizeUniqueConstraintError') return null; // posted concurrently
    throw e;
  }
}

// ── Event builders ────────────────────────────────────────────────────────────────────────────

/** Value received on a GRN: accepted quantity × PO unit price, per line. */
async function grnValue(grn) {
  const { GRNItem, PurchaseOrderItem } = m();
  const items = await GRNItem.findAll({ where: { grn_id: grn.id } });
  const poItems = await PurchaseOrderItem.findAll({ where: { po_id: grn.po_id } });
  const priceOf = (it) => {
    const p = poItems.find((x) => x.id === it.po_item_id) || poItems.find((x) => x.item_name && x.item_name === it.item_name);
    return Number(p?.unit_price || 0);
  };
  const lines = items.map((it) => ({ name: it.item_name, qty: Number(it.accepted_quantity || 0), price: priceOf(it) }))
    .filter((l) => l.qty > 0);
  return { lines, total: round2(lines.reduce((s, l) => s + l.qty * l.price, 0)) };
}

async function postGrn(grnId, opts = {}) {
  const { GRN, PurchaseOrder } = m();
  const grn = await GRN.findByPk(grnId);
  if (!grn || grn.status === 'REJECTED') return null;
  const po = grn.po_id ? await PurchaseOrder.findByPk(grn.po_id) : null;
  const { lines, total } = await grnValue(grn);
  if (!(total > 0)) return null;
  const acct = receiptAccount(po, 'GOODS');
  const what = lines.map((l) => `${l.qty} × ${l.name}`).join(', ');
  return post({
    clientId: grn.client_id, key: `GRN:${grn.id}`, eventType: 'GOODS_RECEIPT', sourceModule: 'GRN', sourceId: grn.id,
    sourceRef: grn.grn_number, date: grn.received_date || grn.created_at, vendorId: grn.vendor_id || po?.vendor_id, poId: grn.po_id,
    narration: `Goods received, not yet invoiced – ${grn.grn_number}${po ? ` on ${po.po_number}` : ''}`,
    lines: [
      { account: acct, debit: total, memo: `${what} at PO price`.slice(0, 255) },
      { account: '2015', credit: total, memo: `${po?.po_number || ''} / ${grn.grn_number}` }
    ],
    source: opts.source
  });
}

async function postSes(sesId, opts = {}) {
  const { ServiceEntrySheet, PurchaseOrder } = m();
  const ses = await ServiceEntrySheet.findByPk(sesId);
  if (!ses || ses.status !== 'APPROVED') return null;
  const total = round2(ses.total_value);
  if (!(total > 0)) return null;
  const po = ses.po_id ? await PurchaseOrder.findByPk(ses.po_id) : null;
  const period = [ses.service_period_from, ses.service_period_to].filter(Boolean).join(' – ');
  return post({
    clientId: ses.client_id, key: `SES:${ses.id}`, eventType: 'SERVICE_RECEIPT', sourceModule: 'SES', sourceId: ses.id,
    sourceRef: ses.ses_number, date: ses.approved_at || ses.updated_at, vendorId: ses.vendor_id || po?.vendor_id, poId: ses.po_id,
    narration: `Service received, not yet invoiced – ${ses.ses_number}${period ? ` (${period})` : ''}`,
    lines: [
      { account: receiptAccount(po, 'SERVICE'), debit: total, memo: String(ses.service_description || 'Service performed').slice(0, 255) },
      { account: '2015', credit: total, memo: `${po?.po_number || ''} / ${ses.ses_number}` }
    ],
    source: opts.source
  });
}

/**
 * Advance on a PO and how much of it is still to be adjusted: the advance less what its invoices
 * (other than rejected ones) have already set off.
 */
async function advanceStatus(poId, { transaction, excludeInvoiceId } = {}) {
  const { PurchaseOrder, Invoice } = m();
  const po = poId ? await PurchaseOrder.findByPk(poId, { attributes: ['id', 'po_number', 'advance_given', 'advance_amount'], transaction }) : null;
  const amount = po?.advance_given ? round2(po.advance_amount) : 0;
  if (!(amount > 0)) return { given: false, amount: 0, adjusted: 0, available: 0, po_number: po?.po_number || null };
  const where = { po_id: po.id, status: { [Op.ne]: 'REJECTED' } };
  if (excludeInvoiceId) where.id = { [Op.ne]: excludeInvoiceId };
  const adjusted = round2(await Invoice.sum('advance_adjusted', { where, transaction }) || 0);
  return { given: true, amount, adjusted, available: round2(Math.max(0, amount - adjusted)), po_number: po.po_number };
}

/** Advance paid to the vendor when the PO is issued with one. */
async function postAdvance(poId, opts = {}) {
  const { PurchaseOrder } = m();
  const po = await PurchaseOrder.findByPk(poId);
  if (!po || !po.advance_given || ['REJECTED', 'CANCELLED'].includes(po.status)) return null;
  const amount = round2(po.advance_amount);
  if (!(amount > 0)) return null;
  return post({
    clientId: po.client_id, key: `PO_ADVANCE:${po.id}`, eventType: 'ADVANCE', sourceModule: 'PO', sourceId: po.id,
    sourceRef: po.po_number, date: po.order_date || po.created_at, vendorId: po.vendor_id, poId: po.id,
    narration: `Advance paid to vendor on ${po.po_number}`,
    lines: [
      { account: '1300', debit: amount, memo: `Advance on ${po.po_number} – adjusted against its invoices` },
      { account: '1010', credit: amount, memo: 'Bank payment' }
    ],
    source: opts.source
  });
}

/** An invoice posts once it is matched (or needs no match); an open exception or rejection waits. */
const invoicePostable = (inv) => inv && !['EXCEPTION', 'REJECTED'].includes(inv.status) && inv.matching_status !== 'MISMATCHED';

async function postInvoice(invoiceId, opts = {}) {
  const { Invoice, PurchaseOrder, GRN, ServiceEntrySheet, JournalEntry, JournalLine } = m();
  const inv = await Invoice.findByPk(invoiceId);
  if (!invoicePostable(inv)) return null;
  const po = inv.po_id ? await PurchaseOrder.findByPk(inv.po_id) : null;

  const gst = round2(inv.gst_amount || Number(inv.cgst_amount || 0) + Number(inv.sgst_amount || 0) + Number(inv.igst_amount || 0));
  const gross = round2(inv.total_amount || Number(inv.base_amount || 0) + gst);
  const base = round2(gross - gst);
  const tds = tdsOf(inv);

  // Receipt being invoiced: clear what is still open on its GR/IR, the excess is a price variance.
  let receipt = null;
  if (inv.grn_id) {
    const grn = await GRN.findByPk(inv.grn_id);
    if (grn) receipt = { key: `GRN:${grn.id}`, ref: grn.grn_number, value: (await grnValue(grn)).total };
  } else if (inv.ses_id) {
    const ses = await ServiceEntrySheet.findByPk(inv.ses_id);
    if (ses && ses.status === 'APPROVED') receipt = { key: `SES:${ses.id}`, ref: ses.ses_number, value: round2(ses.total_value) };
  }
  const costAcct = receiptAccount(po, inv.ses_id ? 'SERVICE' : 'GOODS');
  const lines = [];
  if (receipt && receipt.value > 0) {
    const cleared = await JournalLine.sum('debit', {
      where: { client_id: inv.client_id, account_code: '2015', memo: { [Op.like]: `%${receipt.ref}%` } },
      include: [{ model: JournalEntry, as: 'entry', attributes: [], where: { event_type: 'INVOICE', status: 'POSTED' } }]
    }) || 0;
    // Goods sent back before this invoice already came off GR/IR (Dr GR/IR on the return).
    const returnedBefore = inv.grn_id
      ? Number(await m().PurchaseReturn.sum('total_value', { where: { grn_id: inv.grn_id, stage: 'BEFORE_INVOICE' } }) || 0)
      : 0;
    const open = round2(Math.max(0, receipt.value - Number(cleared) - returnedBefore));
    const clear = round2(Math.min(base, open));
    if (clear > 0) lines.push({ account: '2015', debit: clear, memo: `Clear GR/IR – ${receipt.ref}` });
    if (base - clear > 0.009) lines.push({ account: '5010', debit: round2(base - clear), memo: `Invoiced above the received value of ${receipt.ref}` });
  } else {
    lines.push({ account: costAcct, debit: base, memo: po ? `No receipt recorded on ${po.po_number}` : 'Non-PO invoice' });
  }

  if (gst > 0) {
    if (inv.itc_eligible === false) {
      lines.push({ account: costAcct, debit: gst, memo: 'GST not creditable – part of cost' });
    } else {
      const c = round2(inv.cgst_amount), s = round2(inv.sgst_amount), i = round2(inv.igst_amount);
      if (Math.abs(c + s + i - gst) < 0.02) {
        lines.push({ account: '1411', debit: c, memo: 'Input CGST' }, { account: '1412', debit: s, memo: 'Input SGST' }, { account: '1410', debit: i, memo: 'Input IGST' });
      } else {
        lines.push({ account: '1410', debit: gst, memo: 'Input GST (CGST/SGST split not determined)' });
      }
    }
  }
  const advance = round2(inv.advance_adjusted);
  const netOf = [tds && 'TDS', advance && 'advance'].filter(Boolean).join(' and ');
  lines.push({ account: '2010', credit: round2(gross - tds - advance), memo: `${inv.invoice_number}${netOf ? ` – net of ${netOf}` : ''}` });
  if (tds) lines.push({ account: '2160', credit: tds, memo: `TDS u/s ${inv.tds_section_code} @ ${Number(inv.tds_rate_percent || 0)}% on taxable value ₹${inr(base)}` });
  if (advance) lines.push({ account: '1300', credit: advance, memo: `Advance paid on ${po?.po_number || 'the PO'} adjusted` });

  const entry = await post({
    clientId: inv.client_id, key: `INVOICE:${inv.id}`, eventType: 'INVOICE', sourceModule: 'INVOICE', sourceId: inv.id,
    sourceRef: inv.invoice_number, date: inv.invoice_date || inv.created_at, vendorId: inv.vendor_id, poId: inv.po_id, invoiceId: inv.id,
    narration: `Vendor invoice ${inv.invoice_number}${receipt ? ` against ${receipt.ref}` : ''}`, lines, source: opts.source
  });
  // Returns recorded while the invoice waited on a match exception post now, after it.
  if (entry) {
    for (const r of await m().PurchaseReturn.findAll({ where: { invoice_id: inv.id, stage: 'AFTER_INVOICE' }, attributes: ['id'] })) {
      await postReturn(r.id, opts);
    }
  }
  return entry;
}

/**
 * Goods sent back to the vendor. Before the invoice: reverse the receipt (Dr GR/IR, Cr the receipt
 * account). After it: Dr the vendor for the value plus its share of the invoice GST, Cr the cost and
 * the input GST; this waits until the invoice journal itself is posted.
 */
async function postReturn(returnId, opts = {}) {
  const { PurchaseReturn, PurchaseOrder, GRN, Invoice, JournalEntry } = m();
  const ret = await PurchaseReturn.findByPk(returnId);
  if (!ret || !(Number(ret.total_value) > 0)) return null;
  const po = ret.po_id ? await PurchaseOrder.findByPk(ret.po_id) : null;
  const grn = await GRN.findByPk(ret.grn_id, { attributes: ['id', 'grn_number'] });
  const costAcct = receiptAccount(po, 'GOODS');
  const value = round2(ret.total_value);
  const base = {
    clientId: ret.client_id, key: `RETURN:${ret.id}`, eventType: 'PURCHASE_RETURN', sourceModule: 'RETURN', sourceId: ret.id,
    sourceRef: ret.return_number, date: ret.return_date, vendorId: ret.vendor_id, poId: ret.po_id, source: opts.source
  };

  if (ret.stage !== 'AFTER_INVOICE') {
    return post({
      ...base,
      narration: `Goods returned to vendor before invoicing – ${ret.return_number} against ${grn?.grn_number || 'the GRN'}`,
      lines: [
        { account: '2015', debit: value, memo: `Return ${ret.return_number} / ${grn?.grn_number || ''}` },
        { account: costAcct, credit: value, memo: String(ret.reason || 'Returned to vendor').slice(0, 255) }
      ]
    });
  }

  const inv = ret.invoice_id ? await Invoice.findByPk(ret.invoice_id) : null;
  if (!inv) return null;
  const invoiceEntry = await JournalEntry.findOne({ where: { client_id: ret.client_id, dedupe_key: `INVOICE:${inv.id}`, status: 'POSTED' }, attributes: ['id'] });
  if (!invoiceEntry) return null; // posts with the invoice once its match exception is resolved
  const gst = round2(ret.gst_amount);
  const lines = [{ account: '2010', debit: round2(value + gst), memo: `Return ${ret.return_number} against ${inv.invoice_number}` },
    { account: costAcct, credit: value, memo: String(ret.reason || 'Returned to vendor').slice(0, 255) }];
  if (gst > 0) {
    if (inv.itc_eligible === false) {
      lines.push({ account: costAcct, credit: gst, memo: 'GST on returned goods (was part of cost)' });
    } else {
      // Same CGST/SGST/IGST split as the invoice; otherwise all to input IGST, as the invoice posted it.
      const ig = Number(inv.gst_amount || 0);
      const c = Number(inv.cgst_amount || 0), s = Number(inv.sgst_amount || 0), i = Number(inv.igst_amount || 0);
      if (ig > 0 && Math.abs(c + s + i - ig) < 0.02) {
        const cg = round2(gst * c / ig), sg = round2(gst * s / ig);
        lines.push({ account: '1411', credit: cg, memo: 'Input CGST reversed' }, { account: '1412', credit: sg, memo: 'Input SGST reversed' },
          { account: '1410', credit: round2(gst - cg - sg), memo: 'Input IGST reversed' });
      } else {
        lines.push({ account: '1410', credit: gst, memo: 'Input GST reversed' });
      }
    }
  }
  return post({ ...base, invoiceId: inv.id, narration: `Goods returned to vendor after invoice ${inv.invoice_number} – ${ret.return_number}`, lines });
}

/** Rejected after posting: reverse the invoice journal (debits and credits swapped). */
async function reverseInvoice(invoiceId, opts = {}) {
  const { Invoice, JournalEntry, JournalLine } = m();
  const inv = await Invoice.findByPk(invoiceId);
  if (!inv || inv.status !== 'REJECTED') return null;
  const original = await JournalEntry.findOne({ where: { client_id: inv.client_id, dedupe_key: `INVOICE:${inv.id}`, status: 'POSTED' } });
  if (!original) return null;
  const lines = await JournalLine.findAll({ where: { journal_entry_id: original.id }, order: [['line_no', 'ASC']] });
  const entry = await post({
    clientId: inv.client_id, key: `INVOICE_REVERSAL:${inv.id}`, eventType: 'REVERSAL', sourceModule: 'INVOICE', sourceId: inv.id,
    sourceRef: inv.invoice_number, date: inv.rejected_at || new Date(), vendorId: inv.vendor_id, poId: inv.po_id, invoiceId: inv.id,
    narration: `Reversal of ${original.je_number} – invoice ${inv.invoice_number} rejected${inv.rejection_reason ? `: ${inv.rejection_reason}` : ''}`,
    lines: lines.map((l) => ({ account: l.account_code, accountName: l.account_name, debit: l.credit, credit: l.debit, memo: `Reverse: ${l.memo || ''}` })),
    reversalOfId: original.id, source: opts.source
  });
  if (entry) await original.update({ status: 'REVERSED' });
  // Returns posted against the rejected invoice are reversed with it.
  for (const r of await m().PurchaseReturn.findAll({ where: { invoice_id: inv.id, stage: 'AFTER_INVOICE' }, attributes: ['id', 'return_number'] })) {
    const rj = await JournalEntry.findOne({ where: { client_id: inv.client_id, dedupe_key: `RETURN:${r.id}`, status: 'POSTED' } });
    if (!rj) continue;
    const rl = await JournalLine.findAll({ where: { journal_entry_id: rj.id }, order: [['line_no', 'ASC']] });
    const rev = await post({
      clientId: inv.client_id, key: `RETURN_REVERSAL:${r.id}`, eventType: 'REVERSAL', sourceModule: 'RETURN', sourceId: r.id,
      sourceRef: r.return_number, date: inv.rejected_at || new Date(), vendorId: inv.vendor_id, poId: inv.po_id, invoiceId: inv.id,
      narration: `Reversal of ${rj.je_number} – invoice ${inv.invoice_number} rejected`,
      lines: rl.map((l) => ({ account: l.account_code, accountName: l.account_name, debit: l.credit, credit: l.debit, memo: `Reverse: ${l.memo || ''}` })),
      reversalOfId: rj.id, source: opts.source
    });
    if (rev) await rj.update({ status: 'REVERSED' });
  }
  return entry;
}

async function postPayment(paymentId, opts = {}) {
  const { ApPayment, Invoice } = m();
  const pay = await ApPayment.findByPk(paymentId);
  if (!pay || !(Number(pay.amount) > 0)) return null;
  const inv = await Invoice.findByPk(pay.invoice_id);
  if (!inv) return null;
  return post({
    clientId: pay.client_id || inv.client_id, key: `PAYMENT:${pay.id}`, eventType: 'PAYMENT', sourceModule: 'PAYMENT', sourceId: pay.id,
    sourceRef: pay.reference || inv.invoice_number, date: pay.payment_date || pay.created_at, vendorId: inv.vendor_id, poId: inv.po_id, invoiceId: inv.id,
    narration: `Payment to vendor for ${inv.invoice_number}${pay.payment_mode ? ` by ${pay.payment_mode}` : ''}`,
    lines: [
      { account: '2010', debit: pay.amount, memo: `Settle ${inv.invoice_number}` },
      { account: '1010', credit: pay.amount, memo: [pay.payment_mode, pay.reference].filter(Boolean).join(' · ') || 'Bank payment' }
    ],
    source: opts.source
  });
}

/** Marked paid without a recorded payment (Mark paid, external/ERP payment): settle the rest. */
async function postSettlement(invoiceId, opts = {}) {
  const { Invoice, ApPayment } = m();
  const inv = await Invoice.findByPk(invoiceId);
  if (!inv || inv.status !== 'PAID') return null;
  const recorded = Number(await ApPayment.sum('amount', { where: { invoice_id: inv.id } }) || 0);
  const rest = round2(netPayableOf(inv) - recorded);
  if (!(rest > 0.009)) return null;
  return post({
    clientId: inv.client_id, key: `SETTLEMENT:${inv.id}`, eventType: 'PAYMENT', sourceModule: 'INVOICE', sourceId: inv.id,
    sourceRef: inv.external_payment_ref || inv.invoice_number, date: inv.payment_date || inv.updated_at, vendorId: inv.vendor_id, poId: inv.po_id, invoiceId: inv.id,
    narration: `Invoice ${inv.invoice_number} marked paid${inv.payment_source ? ` (${inv.payment_source})` : ''}`,
    lines: [
      { account: '2010', debit: rest, memo: `Settle ${inv.invoice_number}` },
      { account: '1010', credit: rest, memo: inv.external_payment_ref || 'Bank payment' }
    ],
    source: opts.source
  });
}

// ── Hooks ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Run after the surrounding transaction commits (or right away), keeping the request's user.
 * delayMs lets the request finish its follow-up updates first; the builders re-read the record.
 */
function schedule(options, label, fn, delayMs = 0) {
  const ctx = requestContext.current();
  const run = () => {
    const go = () => fn().catch((e) => console.error(`[apJournal] ${label} not posted:`, e.message));
    const start = () => (ctx ? requestContext.run(ctx, go) : go());
    return delayMs ? setTimeout(start, delayMs) : start();
  };
  if (options?.transaction && typeof options.transaction.afterCommit === 'function') options.transaction.afterCommit(run);
  else setImmediate(run);
}

// Booking an invoice runs the three-way match right after the insert, which can turn it into an
// exception; post a new invoice from the settled record, not the first insert.
const INVOICE_SETTLE_MS = 3000;

const changed = (row, field) => typeof row.changed === 'function' && row.changed(field);

function install(db) {
  models = db;
  const { GRN, ServiceEntrySheet, Invoice, ApPayment, PurchaseOrder, PurchaseReturn } = db;
  if (PurchaseReturn) PurchaseReturn.addHook('afterCreate', 'apJournal', (row, o) => schedule(o, `return ${row.id}`, () => postReturn(row.id)));
  if (PurchaseOrder) {
    PurchaseOrder.addHook('afterCreate', 'apJournal', (row, o) => {
      if (row.advance_given) schedule(o, `PO ${row.id} advance`, () => postAdvance(row.id));
    });
  }
  if (GRN) GRN.addHook('afterCreate', 'apJournal', (row, o) => schedule(o, `GRN ${row.id}`, () => postGrn(row.id)));
  if (ServiceEntrySheet) {
    ServiceEntrySheet.addHook('afterUpdate', 'apJournal', (row, o) => {
      if (changed(row, 'status') && row.status === 'APPROVED') schedule(o, `SES ${row.id}`, () => postSes(row.id));
    });
  }
  if (Invoice) {
    // Set off what is left of the PO's advance against a new invoice, up to what the vendor is owed.
    Invoice.addHook('beforeCreate', 'apJournalAdvance', async (row, o) => {
      if (!row.po_id || Number(row.advance_adjusted || 0) > 0) return;
      try {
        const { available } = await advanceStatus(row.po_id, { transaction: o?.transaction });
        const owed = round2(Number(row.total_amount || 0) - (row.tds_section_code ? Number(row.tds_amount || 0) : 0));
        const setOff = round2(Math.min(available, Math.max(0, owed)));
        if (setOff > 0) row.advance_adjusted = setOff;
      } catch (e) {
        console.error('[apJournal] advance not adjusted:', e.message);
      }
    });
    Invoice.addHook('afterCreate', 'apJournal', (row, o) => {
      schedule(o, `invoice ${row.id}`, () => postInvoice(row.id), INVOICE_SETTLE_MS);
    });
    Invoice.addHook('afterUpdate', 'apJournal', (row, o) => {
      if (!changed(row, 'status') && !changed(row, 'matching_status')) return;
      if (row.status === 'REJECTED') return schedule(o, `invoice ${row.id} reversal`, () => reverseInvoice(row.id));
      if (invoicePostable(row)) schedule(o, `invoice ${row.id}`, () => postInvoice(row.id));
      if (row.status === 'PAID') schedule(o, `invoice ${row.id} settlement`, () => postSettlement(row.id));
    });
  }
  if (ApPayment) ApPayment.addHook('afterCreate', 'apJournal', (row, o) => schedule(o, `payment ${row.id}`, () => postPayment(row.id)));
}

// ── Backfill ──────────────────────────────────────────────────────────────────────────────────

/** Post journals for documents that existed before the engine (or missed one). Idempotent. */
async function backfill(clientId) {
  const { GRN, ServiceEntrySheet, Invoice, ApPayment, PurchaseOrder } = m();
  const where = { client_id: clientId };
  const opts = { source: 'BACKFILL' };
  const out = { posted: 0, failed: [] };
  const tryPost = async (label, fn) => {
    try { if (await fn()) out.posted += 1; } catch (e) { out.failed.push(`${label}: ${e.message}`); }
  };
  for (const p of await PurchaseOrder.findAll({ where: { ...where, advance_given: true }, attributes: ['id'], order: [['id', 'ASC']] })) await tryPost(`PO ${p.id} advance`, () => postAdvance(p.id, opts));
  for (const g of await GRN.findAll({ where, attributes: ['id'], order: [['id', 'ASC']] })) await tryPost(`GRN ${g.id}`, () => postGrn(g.id, opts));
  for (const s of await ServiceEntrySheet.findAll({ where: { ...where, status: 'APPROVED' }, attributes: ['id'], order: [['id', 'ASC']] })) await tryPost(`SES ${s.id}`, () => postSes(s.id, opts));
  const invoices = await Invoice.findAll({ where, attributes: ['id', 'status'], order: [['id', 'ASC']] });
  for (const i of invoices) await tryPost(`invoice ${i.id}`, () => postInvoice(i.id, opts));
  for (const r of await m().PurchaseReturn.findAll({ where, attributes: ['id'], order: [['id', 'ASC']] })) await tryPost(`return ${r.id}`, () => postReturn(r.id, opts));
  for (const p of await ApPayment.findAll({ where, attributes: ['id'], order: [['id', 'ASC']] })) await tryPost(`payment ${p.id}`, () => postPayment(p.id, opts));
  for (const i of invoices.filter((x) => x.status === 'PAID')) await tryPost(`settlement ${i.id}`, () => postSettlement(i.id, opts));
  return out;
}

module.exports = {
  ACCOUNTS, install, backfill, ensureAccounts, tdsOf, netPayableOf, receiptAccountsFor, advanceStatus,
  postAdvance, postGrn, postSes, postInvoice, postReturn, reverseInvoice, postPayment, postSettlement
};
