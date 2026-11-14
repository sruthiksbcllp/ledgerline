'use strict';

/**
 * Bill Approvals: the bills waiting for each person.
 *   To approve  - pending bills; each can be approved only by someone whose limit covers it, and not
 *                 by the person who submitted it.
 *   Exceptions  - three-way-match exceptions at the stage routed to the person's role: Procurement
 *                 review (price), receipt check (quantity), Finance review (decide).
 */
const { Op } = require('sequelize');
const { Invoice, Vendor, PurchaseOrder, PurchaseRequisition, User } = require('../models');
const { getClientId } = require('../utils/tenantFilter');
const { recordAudit } = require('../utils/financeAudit');
const rules = require('../services/billApproval.service');

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const clientOf = (req) => getClientId(req) || req.user?.client_id || null;
const DAY = 86400000;
const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / DAY)) : null);
const nameOf = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : null);

const APPROVE_WHERE = { status: 'UNPAID', matching_status: { [Op.ne]: 'MISMATCHED' }, [Op.or]: [{ payment_blocked: false }, { payment_blocked: null }] };
const EXCEPTION_WHERE = { status: 'EXCEPTION', exception_status: 'OPEN' };

async function peopleFor(rows) {
  const ids = new Set();
  rows.forEach((r) => { if (r.submitted_by) ids.add(r.submitted_by); if (r.exception_reviewed_by) ids.add(r.exception_reviewed_by); });
  const prIds = [...new Set(rows.map((r) => r.PurchaseOrder?.pr_id).filter(Boolean))];
  const prs = prIds.length ? await PurchaseRequisition.findAll({ where: { id: { [Op.in]: prIds } }, attributes: ['id', 'pr_number', 'requested_by_user_id'] }) : [];
  prs.forEach((p) => { if (p.requested_by_user_id) ids.add(p.requested_by_user_id); });
  const users = ids.size ? await User.findAll({ where: { id: { [Op.in]: [...ids] } }, attributes: ['id', 'first_name', 'last_name', 'email'] }) : [];
  return { users: new Map(users.map((u) => [u.id, u])), prs: new Map(prs.map((p) => [p.id, p])) };
}

const baseJson = (inv, people) => {
  const pr = inv.PurchaseOrder?.pr_id ? people.prs.get(inv.PurchaseOrder.pr_id) : null;
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    total_amount: inv.total_amount,
    base_amount: inv.base_amount,
    source: inv.source,
    document_url: inv.document_url,
    vendor: inv.Vendor ? { id: inv.Vendor.id, vendor_name: inv.Vendor.vendor_name } : null,
    purchase_order: inv.PurchaseOrder ? { id: inv.PurchaseOrder.id, po_number: inv.PurchaseOrder.po_number } : null,
    requested_by: pr ? nameOf(people.users.get(pr.requested_by_user_id)) : null,
    submitted_by: nameOf(people.users.get(inv.submitted_by)),
    created_at: inv.createdAt
  };
};

exports.list = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const view = req.query.view === 'exceptions' ? 'exceptions' : 'approve';
  const showAll = req.query.all === '1';
  const include = [
    { model: Vendor, attributes: ['id', 'vendor_name'] },
    { model: PurchaseOrder, attributes: ['id', 'po_number', 'pr_id'] }
  ];
  const [pending, exceptions] = await Promise.all([
    Invoice.findAll({ where: { client_id: clientId, ...APPROVE_WHERE }, include, order: [['createdAt', 'ASC']], limit: 500 }),
    Invoice.findAll({ where: { client_id: clientId, ...EXCEPTION_WHERE }, include, order: [['createdAt', 'ASC']], limit: 500 })
  ]);
  const people = await peopleFor([...pending, ...exceptions]);

  const approveRows = pending.map((inv) => {
    const block = rules.approvalBlock(inv, req.user);
    return { ...baseJson(inv, people), needs: rules.neededLabel(inv.total_amount), can_approve: !block, block_reason: block, waiting_days: daysSince(inv.createdAt), mine: !block };
  });
  const exceptionRows = exceptions.map((inv) => {
    const stage = rules.stageOf(inv);
    return {
      ...baseJson(inv, people),
      stage,
      stage_label: rules.STAGES[stage].label,
      exception_type: inv.exception_type || 'OTHER',
      reasons: String(inv.matching_exception_details || inv.payment_block_reason || '').split('; ').filter(Boolean),
      review: inv.exception_reviewed_at ? {
        reason_code: inv.exception_reason_code,
        reason: rules.reasonLabel(inv.exception_reason_code),
        note: inv.exception_review_note,
        by: nameOf(people.users.get(inv.exception_reviewed_by)),
        at: inv.exception_reviewed_at
      } : null,
      can_review: stage !== 'FINANCE_REVIEW' && rules.reviewsStage(inv, req.user),
      can_decide: rules.decides(req.user),
      mine: rules.reviewsStage(inv, req.user),
      waiting_days: daysSince(inv.exception_reviewed_at || inv.createdAt)
    };
  });

  const rows = view === 'approve' ? approveRows : exceptionRows;
  return res.json({
    success: true,
    data: {
      view,
      items: showAll ? rows : rows.filter((r) => r.mine),
      counts: { approve: approveRows.filter((r) => r.mine).length, exceptions: exceptionRows.filter((r) => r.mine).length },
      totals: { approve: approveRows.length, exceptions: exceptionRows.length },
      reasons: rules.REASONS,
      my_limit: Number.isFinite(rules.limitOf(req.user.role)) ? rules.limitOf(req.user.role) : null,
      can_approve_any: rules.limitOf(req.user.role) > 0
    }
  });
};

const loadOwned = (req) => Invoice.findOne({ where: { client_id: clientOf(req), id: req.params.id } });

/** Approve a pending bill (amount limit and submitter rule apply). */
exports.approve = async (req, res) => {
  const invoice = await loadOwned(req);
  if (!invoice) return fail(res, 404, 'Bill not found');
  if (invoice.status !== 'UNPAID') return fail(res, 409, 'Only bills waiting for approval can be approved');
  if (invoice.payment_blocked || invoice.matching_status === 'MISMATCHED') return fail(res, 409, 'This bill has an open exception. It must be resolved first.');
  const block = rules.approvalBlock(invoice, req.user);
  if (block) return fail(res, 403, block);
  const before = invoice.toJSON();
  await invoice.update({ status: 'APPROVED_FOR_PAYMENT', approved_by: req.user.id, approved_at: new Date() });
  await recordAudit(req, { module: 'AP', entityType: 'INVOICE', entityId: invoice.id, action: 'AP_INVOICE_APPROVED', before, after: invoice, note: req.body?.comment || `Approved within the approval limit of ${req.user.role}` });
  return res.json({ success: true, message: `Bill ${invoice.invoice_number} approved for payment` });
};

/** Reject a pending bill (any approver; the limit caps approving, not rejecting). */
exports.reject = async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return fail(res, 400, 'Give a reason for rejecting the bill');
  const invoice = await loadOwned(req);
  if (!invoice) return fail(res, 404, 'Bill not found');
  if (invoice.status !== 'UNPAID' || Number(invoice.paid_amount) > 0) return fail(res, 409, 'Only bills waiting for approval can be rejected here');
  if (rules.limitOf(req.user.role) === 0) return fail(res, 403, 'Your role does not approve or reject bills');
  const before = invoice.toJSON();
  await invoice.update({ status: 'REJECTED', rejected_by: req.user.id, rejected_at: new Date(), rejection_reason: reason });
  await recordAudit(req, { module: 'AP', entityType: 'INVOICE', entityId: invoice.id, action: 'AP_INVOICE_REJECTED', before, after: invoice, note: reason });
  return res.json({ success: true, message: `Bill ${invoice.invoice_number} rejected` });
};

/** Procurement / Warehouse review of an exception: record the reason and send it to Finance. */
exports.review = async (req, res) => {
  const invoice = await loadOwned(req);
  if (!invoice) return fail(res, 404, 'Bill not found');
  if (invoice.status !== 'EXCEPTION' || invoice.exception_status !== 'OPEN') return fail(res, 409, 'This bill has no open exception');
  const stage = rules.stageOf(invoice);
  if (stage === 'FINANCE_REVIEW') return fail(res, 409, 'This exception is already with Finance');
  if (!rules.reviewsStage(invoice, req.user)) return fail(res, 403, `This exception is waiting for ${rules.STAGES[stage].label}`);
  const code = String(req.body?.reason_code || '').toUpperCase();
  if (!rules.REASONS[stage].some((r) => r.code === code)) return fail(res, 400, 'Choose what should happen with this bill');
  const note = String(req.body?.note || '').trim().slice(0, 500) || null;
  const before = invoice.toJSON();
  await invoice.update({
    exception_stage: 'FINANCE_REVIEW', exception_reason_code: code, exception_review_note: note,
    exception_reviewed_by: req.user.id, exception_reviewed_at: new Date()
  });
  await recordAudit(req, {
    module: 'AP', entityType: 'INVOICE', entityId: invoice.id, action: 'AP_EXCEPTION_REVIEWED', before, after: invoice,
    note: `${rules.STAGES[stage].label}: ${rules.reasonLabel(code)}${note ? ` (${note})` : ''}. Sent to Finance.`
  });
  return res.json({ success: true, message: 'Sent to Finance for the decision' });
};

/** Finance decides an exception: accept (the bill goes for approval by amount) or reject the bill. */
exports.decide = async (req, res) => {
  const invoice = await loadOwned(req);
  if (!invoice) return fail(res, 404, 'Bill not found');
  if (invoice.status !== 'EXCEPTION' || invoice.exception_status !== 'OPEN') return fail(res, 409, 'This bill has no open exception');
  if (!rules.decides(req.user)) return fail(res, 403, 'Only Finance or the Director / CFO decide exceptions');
  const decision = String(req.body?.decision || '').toUpperCase();
  const note = String(req.body?.note || '').trim().slice(0, 500) || null;
  if (!['ACCEPT', 'REJECT'].includes(decision)) return fail(res, 400, 'Accept or reject the bill');
  if (decision === 'REJECT' && !note) return fail(res, 400, 'Give a reason for rejecting the bill');
  const stage = rules.stageOf(invoice);
  const skipped = stage !== 'FINANCE_REVIEW' ? ` (decided before ${rules.STAGES[stage].label})` : '';
  const before = invoice.toJSON();
  const common = { exception_resolved_by: req.user.id, exception_resolved_at: new Date(), exception_stage: null };
  if (decision === 'ACCEPT') {
    await invoice.update({
      ...common, status: 'UNPAID', matching_status: 'MATCHED', payment_blocked: false, payment_block_reason: null,
      exception_status: 'MANUAL_APPROVED', matching_exception_details: note || invoice.matching_exception_details
    });
  } else {
    await invoice.update({
      ...common, status: 'REJECTED', exception_status: 'REJECTED', rejected_by: req.user.id, rejected_at: new Date(), rejection_reason: note
    });
  }
  await recordAudit(req, {
    module: 'AP', entityType: 'INVOICE', entityId: invoice.id, action: decision === 'ACCEPT' ? 'AP_EXCEPTION_ACCEPTED' : 'AP_EXCEPTION_REJECTED',
    before, after: invoice, note: `${decision === 'ACCEPT' ? 'Exception accepted; bill sent for approval' : 'Bill rejected'}${skipped}${note ? `: ${note}` : ''}`
  });
  return res.json({ success: true, message: decision === 'ACCEPT' ? 'Accepted: the bill now waits for approval by amount' : 'Bill rejected' });
};
