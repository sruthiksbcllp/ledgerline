'use strict';
/**
 * AP journal: the balanced entries posted by services/apJournal.service.js for goods and service
 * receipts, invoices, payments and reversals, plus account balances for the AP accounts.
 */
const { Op } = require('sequelize');
const { JournalEntry, JournalLine, GlAccount, Vendor, sequelize } = require('../models');
const { getClientId } = require('../utils/tenantFilter');
const journals = require('../services/apJournal.service');

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

/** Post any missing journals for this company's existing documents (safe to repeat). */
exports.backfill = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return res.status(400).json({ success: false, message: 'Select a company first' });
  const out = await journals.backfill(clientId);
  return res.json({ success: true, message: out.posted ? `${out.posted} journal(s) posted` : 'All journals are already posted', data: out });
};
