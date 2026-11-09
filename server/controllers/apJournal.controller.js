'use strict';
/**
 * AP journal: the balanced entries posted by services/apJournal.service.js for goods and service
 * receipts, invoices, payments and reversals, plus account balances for the AP accounts.
 */
const { Op } = require('sequelize');
const { JournalEntry, JournalLine, GlAccount, Vendor, sequelize } = require('../models');
const { getClientId } = require('../utils/tenantFilter');
const journals = require('../services/apJournal.service');
const { memoSection, sectionInfo } = require('../utils/tdsSection');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clientOf = (req) => getClientId(req) || req.user?.client_id || null;

// The first visit per company after a server start posts any missing journals (documents from
// before the engine, or an event whose posting failed). Already-posted events are skipped.
// The page asks for the list and the balances together, so both wait on the same run.
const backfilled = new Map();
function backfillOnce(clientId) {
  if (!backfilled.has(clientId)) {
    backfilled.set(clientId, journals.backfill(clientId).catch((e) => console.error('[apJournal] backfill failed:', e.message)));
  }
  return backfilled.get(clientId);
}

exports.list = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return res.status(400).json({ success: false, message: 'Select a company first' });
  await backfillOnce(clientId);
  const { event_type, vendor_id, from, to, q, account } = req.query;
  const where = { client_id: clientId };
  if (event_type) where.event_type = event_type;
  if (vendor_id) where.vendor_id = Number(vendor_id);
  if (from || to) where.entry_date = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
  if (q) where[Op.or] = [{ je_number: { [Op.like]: `%${q}%` } }, { source_ref: { [Op.like]: `%${q}%` } }, { narration: { [Op.like]: `%${q}%` } }];
  if (account) {
    const hits = await JournalLine.findAll({ where: { client_id: clientId, account_code: account }, attributes: ['journal_entry_id'], raw: true });
    where.id = [...new Set(hits.map((h) => h.journal_entry_id))];
  }
  const rows = await JournalEntry.findAll({
    where,
    include: [
      { model: JournalLine, as: 'lines' },
      { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'], required: false }
    ],
    order: [['entry_date', 'DESC'], ['id', 'DESC'], [{ model: JournalLine, as: 'lines' }, 'line_no', 'ASC']],
    limit: Math.min(Number(req.query.limit) || 500, 2000)
  });
  return res.json({ success: true, data: rows });
};

exports.getOne = async (req, res) => {
  const row = await JournalEntry.findOne({
    where: { id: req.params.id, client_id: clientOf(req) },
    include: [{ model: JournalLine, as: 'lines' }, { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'], required: false }],
    order: [[{ model: JournalLine, as: 'lines' }, 'line_no', 'ASC']]
  });
  if (!row) return res.status(404).json({ success: false, message: 'Journal not found' });
  return res.json({ success: true, data: row });
};

/** Journals posted for one document: /source/INVOICE/42 (its invoice, payments, reversal), /source/GRN/7 … */
exports.bySource = async (req, res) => {
  const clientId = clientOf(req);
  const module = String(req.params.module || '').toUpperCase();
  const id = Number(req.params.id);
  const where = module === 'INVOICE'
    ? { client_id: clientId, invoice_id: id }
    : { client_id: clientId, source_module: module, source_id: id };
  const rows = await JournalEntry.findAll({
    where,
    include: [{ model: JournalLine, as: 'lines' }],
    order: [['entry_date', 'ASC'], ['id', 'ASC'], [{ model: JournalLine, as: 'lines' }, 'line_no', 'ASC']]
  });
  return res.json({ success: true, data: rows });
};

/** Which accounts a goods (or ?kind=SERVICE) receipt on this PO will post to, for the entry preview. */
exports.receiptPreview = async (req, res) => {
  const { PurchaseOrder } = require('../models');
  const po = await PurchaseOrder.findOne({ where: { id: req.params.poId, client_id: clientOf(req) }, attributes: ['id', 'po_number', 'type'] });
  if (!po) return res.status(404).json({ success: false, message: 'Purchase Order not found' });
  const kind = String(req.query.kind || 'GOODS').toUpperCase() === 'SERVICE' ? 'SERVICE' : 'GOODS';
  return res.json({ success: true, data: { po_id: po.id, po_type: po.type || null, ...journals.receiptAccountsFor(po, kind) } });
};

/** Advance given on this PO and how much is still to be adjusted against its invoices (Create Invoice). */
exports.advancePreview = async (req, res) => {
  const { PurchaseOrder } = require('../models');
  const po = await PurchaseOrder.findOne({ where: { id: req.params.poId, client_id: clientOf(req) }, attributes: ['id'] });
  if (!po) return res.status(404).json({ success: false, message: 'Purchase Order not found' });
  return res.json({ success: true, data: await journals.advanceStatus(po.id) });
};

/**
 * TDS payable by section: deducted on invoices (credits to 2160, less reversals) against what has
 * been deposited with the government (TDS_DEPOSIT journals), plus the deposits made.
 */
async function tdsBySection(clientId) {
  const lines = await JournalLine.findAll({
    where: { client_id: clientId, account_code: '2160' },
    include: [{ model: JournalEntry, as: 'entry', attributes: ['event_type'] }],
    attributes: ['debit', 'credit', 'memo']
  });
  const by = {};
  for (const l of lines) {
    const section = (String(l.memo || '').match(/TDS u\/s (\S+)/) || [])[1] || 'Other';
    const s = by[section] || (by[section] = { section, deducted: 0, deposited: 0 });
    if (l.entry?.event_type === 'TDS_DEPOSIT') s.deposited += Number(l.debit) - Number(l.credit);
    else s.deducted += Number(l.credit) - Number(l.debit);
  }
  return Object.values(by)
    .map((s) => ({ section: s.section, ...sectionInfo(s.section), deducted: round2(s.deducted), deposited: round2(s.deposited), balance: round2(s.deducted - s.deposited) }))
    .filter((s) => s.deducted || s.deposited)
    .sort((a, b) => a.section.localeCompare(b.section));
}

exports.tdsSummary = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return res.status(400).json({ success: false, message: 'Select a company first' });
  await backfillOnce(clientId);
  const sections = await tdsBySection(clientId);
  const deposits = await JournalEntry.findAll({
    where: { client_id: clientId, event_type: 'TDS_DEPOSIT' },
    include: [{ model: JournalLine, as: 'lines' }],
    order: [['entry_date', 'DESC'], ['id', 'DESC'], [{ model: JournalLine, as: 'lines' }, 'line_no', 'ASC']]
  });
  return res.json({ success: true, data: { sections, total_balance: round2(sections.reduce((s, x) => s + x.balance, 0)), deposits } });
};

/** TDS deposited with the government against a challan: Dr TDS payable, Cr Bank (ref 3.8). */
exports.tdsDeposit = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return res.status(400).json({ success: false, message: 'Select a company first' });
  const section = String(req.body?.section || '').trim();
  const challan = String(req.body?.challan_number || '').trim();
  const amount = round2(req.body?.amount);
  const date = req.body?.deposit_date || new Date().toISOString().slice(0, 10);
  if (!section) return res.status(400).json({ success: false, message: 'Choose the TDS section' });
  if (!challan) return res.status(400).json({ success: false, message: 'Enter the challan number (CIN)' });
  if (!(amount > 0)) return res.status(400).json({ success: false, message: 'Enter the amount deposited' });
  const open = (await tdsBySection(clientId)).find((s) => s.section === section);
  if (!open || amount > open.balance + 0.009) {
    return res.status(400).json({ success: false, message: `Only ₹${(open?.balance || 0).toLocaleString('en-IN')} of TDS u/s ${section} is payable` });
  }
  const entry = await journals.post({
    clientId, key: `TDS_DEPOSIT:${challan}:${section}`, eventType: 'TDS_DEPOSIT', sourceModule: 'TDS', sourceId: 0,
    sourceRef: challan, date, narration: `TDS u/s ${memoSection(section)} deposited with the government – challan ${challan}`,
    lines: [
      { account: '2160', debit: amount, memo: `TDS u/s ${memoSection(section)} deposited – challan ${challan}` },
      { account: '1010', credit: amount, memo: `TDS challan ${challan}` }
    ]
  });
  if (!entry) return res.status(409).json({ success: false, message: `Challan ${challan} is already recorded for section ${section}` });
  return res.status(201).json({ success: true, message: `TDS deposit of ₹${amount.toLocaleString('en-IN')} recorded (${entry.je_number})`, data: entry });
};

/** Debit, credit and balance per account. A reversal and the journal it reverses net to zero. */
exports.balances = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return res.status(400).json({ success: false, message: 'Select a company first' });
  await backfillOnce(clientId);
  await journals.ensureAccounts(clientId);
  const { to } = req.query;
  const accounts = await GlAccount.findAll({ where: { client_id: clientId }, order: [['code', 'ASC']] });
  const [sums] = await sequelize.query(
    `SELECT l.account_code AS code, SUM(l.debit) AS debit, SUM(l.credit) AS credit
       FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
      WHERE l.client_id = :clientId ${to ? 'AND e.entry_date <= :to' : ''}
      GROUP BY l.account_code`,
    { replacements: { clientId, to: to || null } }
  );
  const byCode = Object.fromEntries(sums.map((s) => [s.code, s]));
  const rows = accounts.map((a) => {
    const debit = round2(byCode[a.code]?.debit);
    const credit = round2(byCode[a.code]?.credit);
    const net = round2(debit - credit);
    return { code: a.code, name: a.name, type: a.type, description: a.description, debit, credit, balance: Math.abs(net), side: net > 0 ? 'Dr' : net < 0 ? 'Cr' : '' };
  });
  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return res.json({ success: true, data: { accounts: rows, total_debit: totalDebit, total_credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 } });
};

/**
 * Received, not yet invoiced (month-end GR/IR review, AP JE reference 7.1 and 7.3): every goods or
 * service receipt still open on GR/IR clearing at the date, with its age. The open amount is the
 * receipt's credit to 2015 less the GR/IR debits that name it (invoices clearing it, returns before
 * invoicing), with invoice reversals putting it back. Receipts open over 90 days need follow-up.
 */
exports.grirOpen = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return res.status(400).json({ success: false, message: 'Select a company first' });
  await backfillOnce(clientId);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.as_of || '')) ? req.query.as_of : new Date().toISOString().slice(0, 10);
  const lines = await JournalLine.findAll({
    where: { client_id: clientId, account_code: '2015' },
    attributes: ['debit', 'credit', 'memo', 'journal_entry_id'],
    include: [{ model: JournalEntry, as: 'entry', attributes: ['id', 'event_type', 'source_ref', 'entry_date', 'vendor_id', 'po_id'], where: { entry_date: { [Op.lte]: asOf } } }]
  });
  const receipts = lines.filter((l) => ['GOODS_RECEIPT', 'SERVICE_RECEIPT'].includes(l.entry.event_type) && Number(l.credit) > 0);
  const others = lines.filter((l) => !['GOODS_RECEIPT', 'SERVICE_RECEIPT'].includes(l.entry.event_type));
  // "GRN-1" must not match "GRN-10": the reference has to end at a non-word character.
  const names = (memo, ref) => {
    const text = String(memo || '');
    for (let i = text.indexOf(ref); i >= 0; i = text.indexOf(ref, i + 1)) {
      if (!/[A-Za-z0-9_-]/.test(text.charAt(i + ref.length))) return true;
    }
    return false;
  };

  const poIds = [...new Set(receipts.map((l) => l.entry.po_id).filter(Boolean))];
  const vendorIds = [...new Set(receipts.map((l) => l.entry.vendor_id).filter(Boolean))];
  const { PurchaseOrder } = require('../models');
  const [pos, vendors] = await Promise.all([
    poIds.length ? PurchaseOrder.findAll({ where: { id: poIds }, attributes: ['id', 'po_number'] }) : [],
    vendorIds.length ? Vendor.findAll({ where: { id: vendorIds }, attributes: ['id', 'vendor_name'] }) : []
  ]);
  const poNo = Object.fromEntries(pos.map((p) => [p.id, p.po_number]));
  const vendorName = Object.fromEntries(vendors.map((v) => [v.id, v.vendor_name]));
  const day = 24 * 60 * 60 * 1000;
  const bucketOf = (age) => (age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+');

  const rows = receipts.map((l) => {
    const ref = l.entry.source_ref;
    const received = round2(l.credit);
    const cleared = round2(others.filter((o) => names(o.memo, ref)).reduce((s, o) => s + Number(o.debit) - Number(o.credit), 0));
    const open = round2(received - cleared);
    const age = Math.max(0, Math.round((new Date(asOf) - new Date(l.entry.entry_date)) / day));
    return {
      journal_entry_id: l.entry.id, kind: l.entry.event_type === 'SERVICE_RECEIPT' ? 'Service' : 'Goods', receipt: ref,
      po_number: poNo[l.entry.po_id] || null, vendor: vendorName[l.entry.vendor_id] || null, received_on: l.entry.entry_date,
      received, invoiced: cleared, open, age_days: age, bucket: bucketOf(age)
    };
  }).filter((r) => r.open > 0.009).sort((a, b) => b.age_days - a.age_days);

  const buckets = ['0-30', '31-60', '61-90', '90+'].map((b) => ({ bucket: b, count: rows.filter((r) => r.bucket === b).length, amount: round2(rows.filter((r) => r.bucket === b).reduce((s, r) => s + r.open, 0)) }));
  const ledger = round2(lines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0));
  const total = round2(rows.reduce((s, r) => s + r.open, 0));
  return res.json({ success: true, data: { as_of: asOf, rows, buckets, total_open: total, grir_balance: ledger, difference: round2(ledger - total) } });
};

/** Post any missing journals for this company's existing documents (safe to repeat). */
exports.backfill = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return res.status(400).json({ success: false, message: 'Select a company first' });
  const out = await journals.backfill(clientId);
  return res.json({ success: true, message: out.posted ? `${out.posted} journal(s) posted` : 'All journals are already posted', data: out });
};
