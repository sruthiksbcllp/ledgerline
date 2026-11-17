'use strict';

/**
 * Accounts Receivable after the invoice: cash application (one customer payment across several
 * invoices, with TDS the customer deducted, read from a remittance advice by AI), the collections
 * worklist with promises to pay, the ageing report, and the AR journal entries.
 * Every query is scoped to the caller's company.
 */
const crypto = require('crypto');
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const { sequelize, ArCustomer, ArInvoice, ArReceipt, ArReminder, ArPromise, JournalEntry, JournalLine } = require('../models');
const { buildAdminWhere, getClientId } = require('../utils/tenantFilter');
const { recordAudit } = require('../utils/financeAudit');
const { extractInvoice, normalizeDate, toNumber } = require('../services/invoiceExtraction.service');
const { ExtractionError } = require('../services/vendorExtraction.service');
const { outstandingOf, OPEN_INVOICE, OVERDUE_BLOCK_DAYS } = require('../services/arCredit.service');
const reminders = require('../services/arReminder.service');
const arJournal = require('../services/arJournal.service');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.floor((new Date(to) - new Date(from)) / 86400000);
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const text = (v, max = 255) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// ── Cash application ─────────────────────────────────────────────────────────

/**
 * Applies one customer payment to one or more invoices. Each allocation has the cash applied and
 * the TDS the customer deducted; both settle the invoice. Nothing may exceed what is outstanding.
 */
exports.applyPayment = async (req, res) => {
  const body = req.body || {};
  const receivedDate = normalizeDate(body.received_date) || today();
  if (receivedDate > today()) return fail(res, 422, 'The receipt date cannot be in the future');
  const allocations = (Array.isArray(body.allocations) ? body.allocations : [])
    .map((a) => ({ invoice_id: Number(a.invoice_id), amount: round2(toNumber(a.amount)), tds_amount: round2(toNumber(a.tds_amount)) }))
    .filter((a) => a.invoice_id && (a.amount > 0 || a.tds_amount > 0));
  if (!allocations.length) return fail(res, 422, 'Enter the amount received against at least one invoice');
  if (allocations.some((a) => a.amount < 0 || a.tds_amount < 0)) return fail(res, 422, 'Amounts cannot be negative');
  if (new Set(allocations.map((a) => a.invoice_id)).size !== allocations.length) return fail(res, 422, 'An invoice appears twice');
  const group = `PAY-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase();
  try {
    const outcome = await sequelize.transaction(async (transaction) => {
      const invoices = await ArInvoice.findAll({
        where: { ...buildAdminWhere(req), id: allocations.map((a) => a.invoice_id) }, transaction, lock: transaction.LOCK.UPDATE
      });
      const byId = Object.fromEntries(invoices.map((i) => [i.id, i]));
      const applied = [];
      for (const a of allocations) {
        const invoice = byId[a.invoice_id];
        if (!invoice) return { status: 404, message: 'An invoice was not found' };
        if (body.customer_id && Number(invoice.customer_id) !== Number(body.customer_id)) return { status: 422, message: `Invoice ${invoice.invoice_number} belongs to another customer` };
        if (!OPEN_INVOICE.includes(invoice.status)) return { status: 409, message: `Invoice ${invoice.invoice_number} has nothing outstanding` };
        const outstanding = outstandingOf(invoice);
        const settle = round2(a.amount + a.tds_amount);
        if (settle > outstanding + 0.005) return { status: 422, message: `Invoice ${invoice.invoice_number}: ${inr(settle)} is more than the ${inr(outstanding)} outstanding` };
        const before = invoice.toJSON();
        const receipt = await ArReceipt.create({
          client_id: invoice.client_id, invoice_id: invoice.id, amount: a.amount, tds_amount: a.tds_amount, received_date: receivedDate,
          payment_mode: text(body.payment_mode, 30), reference: text(body.reference, 100), notes: text(body.notes, 2000),
          payment_group: allocations.length > 1 ? group : null, created_by: req.user.id
        }, { transaction });
        const received = round2(Number(invoice.amount_received || 0) + a.amount);
        const tds = round2(Number(invoice.tds_deducted || 0) + a.tds_amount);
        const left = round2(Number(invoice.total_amount) - received - tds);
        await invoice.update({ amount_received: received, tds_deducted: tds, status: left <= 0.005 ? 'PAID' : 'PARTIALLY_PAID' }, { transaction });
        applied.push({ invoice, before, receipt, allocation: a });
      }
      return { applied };
    });
    if (outcome.status) return fail(res, outcome.status, outcome.message);
    for (const { invoice, before, receipt, allocation } of outcome.applied) {
      await recordAudit(req, {
        module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: invoice.status === 'PAID' ? 'AR_INVOICE_PAID' : 'AR_RECEIPT_RECORDED', before, after: invoice,
        note: `Received ${inr(allocation.amount)}${allocation.tds_amount ? `, TDS deducted ${inr(allocation.tds_amount)}` : ''}${body.reference ? ` (ref ${body.reference})` : ''}`
      });
      await arJournal.safely(`receipt ${receipt.id}`, () => arJournal.postReceipt(receipt.id));
    }
    await reminders.sweepPromises({ clientId: outcome.applied[0].invoice.client_id }).catch(() => {});
    const cash = round2(allocations.reduce((s, a) => s + a.amount, 0));
    const tds = round2(allocations.reduce((s, a) => s + a.tds_amount, 0));
    const closed = outcome.applied.filter((x) => x.invoice.status === 'PAID').length;
    return res.json({
      success: true,
      message: `${inr(cash)} applied to ${allocations.length} invoice${allocations.length === 1 ? '' : 's'}${tds ? `, with ${inr(tds)} TDS` : ''}; ${closed} fully paid`,
      data: outcome.applied.map((x) => ({ invoice_id: x.invoice.id, invoice_number: x.invoice.invoice_number, status: x.invoice.status, outstanding: outstandingOf(x.invoice) }))
    });
  } catch (error) {
    return fail(res, 500, error.message || 'Could not apply the payment');
  }
};

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Remittance advice read by AI: finds the customer, then proposes which open invoices the payment
 * covers. Invoice numbers named on the advice are matched first; if none are named, the amount is
 * spread over the oldest invoices. A person reviews the proposal before anything is applied.
 */
exports.extractRemittance = async (req, res) => {
  try {
    const result = await extractInvoice(req.file, 'AR');
    const tenantWhere = buildAdminWhere(req);
    const gstin = result.party.gst_number.value;
    const name = String(result.party.name.value || '').trim().toLowerCase();
    let customer = gstin ? await ArCustomer.findOne({ where: { ...tenantWhere, gst_number: gstin } }) : null;
    if (!customer && name) customer = await ArCustomer.findOne({ where: { ...tenantWhere, [Op.and]: [sqlWhere(fn('LOWER', col('customer_name')), name)] } });

    const h = result.header;
    const paid = toNumber(h.amount_paid.value) ?? toNumber(h.total_amount.value) ?? 0;
    const open = await ArInvoice.findAll({
      where: { ...tenantWhere, status: OPEN_INVOICE, ...(customer ? { customer_id: customer.id } : {}) },
      include: [{ model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name'] }],
      order: [['due_date', 'ASC'], ['id', 'ASC']], limit: 500
    });
    // Invoice numbers the advice names: its own reference and every line.
    const mentions = [{ ref: h.invoice_number.value, amount: null }, ...result.line_items.map((l) => ({ ref: l.description, amount: l.amount }))]
      .filter((x) => norm(x.ref).length >= 3);
    const allocations = [];
    const used = new Set();
    for (const inv of open) {
      const key = norm(inv.invoice_number);
      const hit = mentions.find((x) => norm(x.ref).includes(key) || (key.length >= 4 && key.includes(norm(x.ref))));
      if (!hit || used.has(inv.id)) continue;
      used.add(inv.id);
      allocations.push({ invoice: inv, amount: hit.amount, matched_by: 'Invoice number on the advice' });
    }
    if (!customer && allocations.length) customer = await ArCustomer.findByPk(allocations[0].invoice.customer_id);
    let remaining = round2(paid);
    const proposed = [];
    for (const a of allocations) {
      const outstanding = outstandingOf(a.invoice);
      const amount = round2(Math.min(outstanding, a.amount && a.amount > 0 ? a.amount : outstanding, remaining > 0 ? remaining : outstanding));
      remaining = round2(remaining - amount);
      proposed.push({ invoice_id: a.invoice.id, invoice_number: a.invoice.invoice_number, due_date: a.invoice.due_date, outstanding, amount, tds_amount: 0, matched_by: a.matched_by });
    }
    if (!proposed.length && customer && paid > 0) {
      for (const inv of open.filter((i) => i.customer_id === customer.id)) {
        if (remaining <= 0) break;
        const outstanding = outstandingOf(inv);
        const amount = round2(Math.min(outstanding, remaining));
        remaining = round2(remaining - amount);
        proposed.push({ invoice_id: inv.id, invoice_number: inv.invoice_number, due_date: inv.due_date, outstanding, amount, tds_amount: 0, matched_by: 'Oldest invoice first (no invoice number on the advice)' });
      }
    }
    const notes = [];
    if (!customer) notes.push('The customer on the advice could not be matched. Choose the customer.');
    if (customer && !proposed.length) notes.push('No open invoice matches this advice.');
    if (proposed.length && remaining > 0.005) notes.push(`${inr(remaining)} of the payment is not matched to any invoice. Check for TDS, or an invoice not yet recorded.`);
    return res.json({
      success: true,
      data: {
        document_type: result.document_type,
        customer: customer ? { id: customer.id, customer_name: customer.customer_name } : null,
        amount_paid: round2(paid), payment_date: h.invoice_date.value || null, reference: h.invoice_number.value && !proposed.some((p) => norm(p.invoice_number) === norm(h.invoice_number.value)) ? h.invoice_number.value : null,
        allocations: proposed, unmatched_amount: Math.max(0, remaining), notes
      }
    });
  } catch (error) {
    if (error instanceof ExtractionError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    return fail(res, 500, 'Could not read the document. Apply the payment manually.');
  }
};

// ── Collections ──────────────────────────────────────────────────────────────

const BUCKETS = [
  { key: 'not_due', label: 'Not due', test: (d) => d <= 0 },
  { key: 'd0_30', label: '1–30 days', test: (d) => d >= 1 && d <= 30 },
  { key: 'd31_60', label: '31–60 days', test: (d) => d >= 31 && d <= 60 },
  { key: 'd61_90', label: '61–90 days', test: (d) => d >= 61 && d <= 90 },
  { key: 'd90', label: 'Over 90 days', test: (d) => d > 90 }
];
const bucketOf = (days) => BUCKETS.find((b) => b.test(days)) || BUCKETS[0];

/** Open invoices that need chasing, most urgent first (amount outstanding x days overdue). */
exports.worklist = async (req, res) => {
  const tenantWhere = buildAdminWhere(req);
  const clientId = tenantWhere.client_id || getClientId(req);
  if (clientId) await reminders.sweepPromises({ clientId }).catch(() => {});
  const invoices = await ArInvoice.findAll({
    where: { ...tenantWhere, status: OPEN_INVOICE },
    include: [
      { model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name', 'email', 'phone', 'contact_person', 'status'] },
      { model: ArPromise, as: 'promises' },
      { model: ArReminder, as: 'reminders', attributes: ['id', 'stage', 'delivery', 'createdAt'] }
    ],
    limit: 2000
  });
  const now = today();
  const rows = invoices.map((inv) => {
    const days = inv.due_date ? daysBetween(inv.due_date, now) : 0;
    const outstanding = outstandingOf(inv);
    const stage = reminders.stageOf(inv);
    const promises = [...inv.promises].sort((a, b) => b.id - a.id);
    const openPromise = promises.find((p) => p.status === 'OPEN') || null;
    const broken = promises.filter((p) => p.status === 'BROKEN').length;
    const sentAtStage = stage ? inv.reminders.some((r) => r.stage === stage.stage) : true;
    let next = 'Nothing due yet';
    if (openPromise) next = `Wait for the promised payment on ${openPromise.promised_date}`;
    else if (stage && !sentAtStage) next = `Send: ${stage.label.toLowerCase()}`;
    else if (stage?.stage === 'ESCALATED') next = days > OVERDUE_BLOCK_DAYS ? 'Escalated: call the customer; new orders stop at the credit check' : 'Escalated: call the customer';
    else if (stage) next = 'Reminder sent; follow up by phone';
    return {
      id: inv.id, invoice_number: inv.invoice_number, invoice_date: inv.invoice_date, due_date: inv.due_date, customer: inv.customer,
      total_amount: Number(inv.total_amount), outstanding, days_overdue: Math.max(0, days), days_to_due: days < 0 ? -days : 0,
      stage: stage?.stage || null, stage_label: stage?.label || 'Not due', reminder_due: !!(stage && !sentAtStage && !openPromise),
      reminders_sent: inv.reminders.length, last_reminder_at: inv.last_reminder_at, open_promise: openPromise, broken_promises: broken,
      next_action: next, bucket: bucketOf(days).key, priority: Math.round(outstanding * Math.max(1, days) * (broken ? 1.5 : 1))
    };
  });
  const work = rows.filter((r) => r.stage).sort((a, b) => b.priority - a.priority);
  const overdue = rows.filter((r) => r.days_overdue > 0);
  const sum = (list) => round2(list.reduce((s, r) => s + r.outstanding, 0));
  return res.json({
    success: true, data: work,
    summary: {
      outstanding: sum(rows), open_count: rows.length, overdue: sum(overdue), overdue_count: overdue.length,
      reminders_due: work.filter((r) => r.reminder_due).length, escalated: work.filter((r) => r.stage === 'ESCALATED').length,
      promised: round2(rows.filter((r) => r.open_promise).reduce((s, r) => s + Number(r.open_promise.amount), 0)),
      promised_count: rows.filter((r) => r.open_promise).length, broken_promises: rows.filter((r) => r.broken_promises > 0).length
    },
    ladder: reminders.LADDER.map((s) => ({ stage: s.stage, label: s.label, from: s.from, to: Number.isFinite(s.to) ? s.to : null }))
  });
};

exports.addPromise = async (req, res) => {
  const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (!OPEN_INVOICE.includes(invoice.status)) return fail(res, 409, 'This invoice has nothing outstanding');
  const promisedDate = normalizeDate(req.body?.promised_date);
  if (!promisedDate || promisedDate < today()) return fail(res, 422, 'Enter the date the customer promised to pay (today or later)');
  const outstanding = outstandingOf(invoice);
  const amount = round2(toNumber(req.body?.amount) ?? outstanding);
  if (!(amount > 0) || amount > outstanding + 0.005) return fail(res, 422, `The promised amount must be between 0 and the ${inr(outstanding)} outstanding`);
  // A new promise replaces an open one on the same invoice.
  await ArPromise.update({ status: 'CANCELLED' }, { where: { invoice_id: invoice.id, status: 'OPEN' } });
  const promise = await ArPromise.create({ client_id: invoice.client_id, invoice_id: invoice.id, promised_date: promisedDate, amount, note: text(req.body?.note), created_by: req.user.id });
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_PROMISE_RECORDED', note: `Customer promised ${inr(amount)} by ${promisedDate}${promise.note ? `: ${promise.note}` : ''}` });
  return res.status(201).json({ success: true, message: `Promise recorded. Reminders pause until ${promisedDate}.`, data: promise });
};

/** The reminder that would go out for this invoice; ?ai=1 asks AI to write it for this customer. */
exports.reminderDraft = async (req, res) => {
  const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, include: [{ model: ArCustomer, as: 'customer' }] });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (!OPEN_INVOICE.includes(invoice.status)) return fail(res, 409, 'This invoice has nothing outstanding');
  const draft = String(req.query.ai) === '1' ? await reminders.draftReminder(invoice) : await reminders.templateReminder(invoice);
  return res.json({ success: true, data: { ...draft, to_email: invoice.customer?.email || null } });
};

// ── Ageing report ────────────────────────────────────────────────────────────

exports.ageing = async (req, res) => {
  const tenantWhere = buildAdminWhere(req);
  const now = today();
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [open, billed90, receipts30] = await Promise.all([
    ArInvoice.findAll({ where: { ...tenantWhere, status: OPEN_INVOICE }, include: [{ model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name', 'credit_limit', 'status'] }], limit: 5000 }),
    ArInvoice.sum('total_amount', { where: { ...tenantWhere, status: { [Op.ne]: 'CANCELLED' }, invoice_date: { [Op.gte]: since90 } } }),
    ArReceipt.findAll({ where: { ...tenantWhere, received_date: { [Op.gte]: since30 } }, attributes: ['amount', 'tds_amount'] })
  ]);
  const empty = () => Object.fromEntries(BUCKETS.map((b) => [b.key, 0]));
  const totals = { ...empty(), total: 0 };
  const byCustomer = {};
  const invoices = [];
  for (const inv of open) {
    const days = inv.due_date ? daysBetween(inv.due_date, now) : 0;
    const bucket = bucketOf(days).key;
    const amount = outstandingOf(inv);
    const row = byCustomer[inv.customer_id] || (byCustomer[inv.customer_id] = {
      customer_id: inv.customer_id, customer_name: inv.customer?.customer_name || '—', status: inv.customer?.status,
      credit_limit: inv.customer?.credit_limit === null || inv.customer?.credit_limit === undefined ? null : Number(inv.customer.credit_limit),
      ...empty(), total: 0, invoices: 0, oldest_days: 0
    });
    row[bucket] = round2(row[bucket] + amount);
    row.total = round2(row.total + amount);
    row.invoices += 1;
    row.oldest_days = Math.max(row.oldest_days, Math.max(0, days));
    totals[bucket] = round2(totals[bucket] + amount);
    totals.total = round2(totals.total + amount);
    invoices.push({ id: inv.id, invoice_number: inv.invoice_number, customer_name: row.customer_name, invoice_date: inv.invoice_date, due_date: inv.due_date, days_overdue: Math.max(0, days), bucket, outstanding: amount });
  }
  const billed = Number(billed90 || 0);
  return res.json({
    success: true,
    data: {
      as_of: now, buckets: BUCKETS.map((b) => ({ key: b.key, label: b.label })), totals,
      customers: Object.values(byCustomer).sort((a, b) => b.total - a.total),
      invoices: invoices.sort((a, b) => b.days_overdue - a.days_overdue),
      // Days sales outstanding: receivables as a share of the last 90 days' billing, in days.
      dso: billed > 0 ? Math.round((totals.total / billed) * 90) : null, billed_90_days: round2(billed),
      collected_30_days: round2(receipts30.reduce((s, r) => s + Number(r.amount), 0)),
      tds_30_days: round2(receipts30.reduce((s, r) => s + Number(r.tds_amount || 0), 0)),
      overdue: round2(totals.total - totals.not_due), overdue_percent: totals.total ? Math.round(((totals.total - totals.not_due) / totals.total) * 100) : 0
    }
  });
};

// ── AR accounting entries ────────────────────────────────────────────────────

const backfilled = new Set();

exports.journals = async (req, res) => {
  const clientId = buildAdminWhere(req).client_id || getClientId(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  // Invoices and receipts recorded before AR posted journals get theirs the first time this is opened.
  if (!backfilled.has(clientId)) {
    await arJournal.backfill(clientId).catch(() => {});
    backfilled.add(clientId);
  }
  const { from, to, q, event_type } = req.query;
  const where = { client_id: clientId, source_module: arJournal.SOURCE_MODULES };
  if (event_type) where.event_type = event_type;
  if (from || to) where.entry_date = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
  if (q) where[Op.or] = [{ je_number: { [Op.like]: `%${q}%` } }, { source_ref: { [Op.like]: `%${q}%` } }, { narration: { [Op.like]: `%${q}%` } }];
  const rows = await JournalEntry.findAll({
    where, include: [{ model: JournalLine, as: 'lines' }],
    order: [['entry_date', 'DESC'], ['id', 'DESC'], [{ model: JournalLine, as: 'lines' }, 'line_no', 'ASC']], limit: 1000
  });
  // Balance of each AR account from every AR journal (not just the filtered ones).
  const lines = await JournalLine.findAll({
    where: { client_id: clientId }, attributes: ['account_code', 'account_name', 'debit', 'credit'],
    include: [{ model: JournalEntry, as: 'entry', attributes: [], where: { client_id: clientId, source_module: arJournal.SOURCE_MODULES }, required: true }], raw: true
  });
  const balances = {};
  for (const l of lines) {
    const b = balances[l.account_code] || (balances[l.account_code] = { code: l.account_code, name: l.account_name, debit: 0, credit: 0 });
    b.debit = round2(b.debit + Number(l.debit));
    b.credit = round2(b.credit + Number(l.credit));
  }
  // Tie-out: receivables in the ledger against what the customer ledger says is outstanding.
  const openInvoices = await ArInvoice.findAll({ where: { client_id: clientId, status: OPEN_INVOICE }, attributes: ['total_amount', 'amount_received', 'tds_deducted'] });
  const subledger = round2(openInvoices.reduce((s, i) => s + outstandingOf(i), 0));
  const control = balances['1100'] ? round2(balances['1100'].debit - balances['1100'].credit) : 0;
  return res.json({
    success: true, data: rows,
    balances: Object.values(balances).map((b) => ({ ...b, balance: round2(b.debit - b.credit) })).sort((a, b) => a.code.localeCompare(b.code)),
    tie_out: { gl_receivables: control, customer_ledger: subledger, difference: round2(control - subledger), ties: Math.abs(control - subledger) < 0.01 }
  });
};
