'use strict';

/**
 * Service Entry Sheet (SES) - FDS section 8. The receipt document for service procurement
 * (audit fees, consultancy, legal services, IT support), used where goods would use a GRN.
 *
 *   1 Service Performed     - recorded against an issued PO: lines, period, description
 *   2 Service Confirmation  - the department that used the service confirms it was delivered
 *   3 Manager Review        - a manager reviews the quantities and value
 *   4 SES Approval          - an approver within their approval limit approves; the accepted
 *                             quantity then counts as received on the PO, and the SES can be
 *                             matched to the vendor invoice (PO <-> SES <-> Invoice)
 *
 * Segregation of duties: whoever recorded the SES cannot confirm, review or approve it, and the
 * approver must be someone other than the reviewer. Any pending step can reject the SES.
 */
const { Op } = require('sequelize');
const {
  ServiceEntrySheet, ServiceEntrySheetItem, PurchaseOrder, PurchaseOrderItem, PurchaseRequisition,
  Vendor, User, Invoice, sequelize
} = require('../models');
const AppError = require('../utils/appError');
const { sendResponse } = require('../utils/response');
const { buildAdminWhere, getClientId } = require('../utils/tenantFilter');
const { getNextNumber } = require('../services/documentNumbering');
const { canSeeRow, scopeWhere } = require('../middleware/dataAccess.middleware');
const { readScope } = require('../config/dataAccess');
const { isPrivilegedCode, approvalLimitFor, normalize } = require('../config/rbac');
const { logActivity } = require('../utils/activityLogger');
const ImmutableAuditService = require('../services/ImmutableAuditService');

const OPEN_PO_STATUSES = ['ISSUED', 'APPROVED', 'PARTIAL_RECEIVED'];
const PENDING_STATUSES = ['PENDING_CONFIRMATION', 'PENDING_REVIEW', 'PENDING_APPROVAL'];

/** Who may act at each stage, besides company/platform admins. */
const STAGES = {
  confirm: {
    from: 'PENDING_CONFIRMATION', to: 'PENDING_REVIEW', label: 'Service Confirmation',
    roles: ['REQUESTER', 'PROCUREMENT', 'MANAGER'],
    by: 'confirmed_by', at: 'confirmed_at', remarks: 'confirmation_remarks'
  },
  review: {
    from: 'PENDING_REVIEW', to: 'PENDING_APPROVAL', label: 'Manager Review',
    roles: ['MANAGER', 'DIRECTOR_CFO', 'FINANCE'],
    by: 'reviewed_by', at: 'reviewed_at', remarks: 'review_remarks'
  },
  approve: {
    from: 'PENDING_APPROVAL', to: 'APPROVED', label: 'SES Approval',
    roles: ['MANAGER', 'DIRECTOR_CFO', 'FINANCE'],
    by: 'approved_by', at: 'approved_at', remarks: 'approval_remarks'
  }
};
const STAGE_BY_STATUS = Object.fromEntries(Object.entries(STAGES).map(([key, s]) => [s.from, key]));

const isAdminRole = (role) => normalize(role) === 'ADMIN' || isPrivilegedCode(role);
const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const userAttrs = ['id', 'first_name', 'last_name', 'email'];

/**
 * Why `user` may not act on `ses` at `stageKey`, or null when they may.
 * Checks the stage, the role, segregation of duties and (for approval) the approval limit.
 * Rejecting ignores the approval limit: the limit caps what someone may approve, not what they
 * may send back.
 */
function blockReason(ses, stageKey, user, { rejecting = false } = {}) {
  const stage = STAGES[stageKey];
  if (!stage || ses.status !== stage.from) return `This SES is not waiting for ${stage ? stage.label : 'that step'}`;
  const role = normalize(user.role);
  if (!isAdminRole(role) && !stage.roles.includes(role)) return `Your role cannot perform ${stage.label}`;
  const me = Number(user.id);
  if (Number(ses.created_by) === me) return 'The person who recorded the service cannot confirm, review or approve it';
  if (stageKey === 'approve') {
    if (Number(ses.reviewed_by) === me) return 'The approver must be someone other than the manager who reviewed it';
    const limit = isAdminRole(role) || rejecting ? null : approvalLimitFor(role);
    if (limit !== null && Number(ses.total_value) > limit) {
      return `SES value ${money(ses.total_value).toLocaleString('en-IN')} is above your approval limit of ${limit.toLocaleString('en-IN')}`;
    }
  }
  return null;
}

/** The workflow steps this user can take on this SES right now: { confirm, review, approve, reject }. */
function allowedActions(ses, user) {
  const stageKey = STAGE_BY_STATUS[ses.status];
  const can = { confirm: false, review: false, approve: false, reject: false };
  if (!stageKey) return can;
  can[stageKey] = !blockReason(ses, stageKey, user);
  can.reject = !blockReason(ses, stageKey, user, { rejecting: true });
  return can;
}

/**
 * Quantity of each PO line still open for a new SES: ordered - already received (GRNs and
 * approved SES) - quantity on SES still in the workflow. Map of po_item_id -> open quantity.
 */
async function openQuantities(poId, { transaction, excludeSesId } = {}) {
  const poItems = await PurchaseOrderItem.findAll({ where: { po_id: poId }, transaction });
  const pending = await ServiceEntrySheetItem.findAll({
    attributes: ['po_item_id', 'quantity'],
    include: [{
      model: ServiceEntrySheet, attributes: [], required: true,
      where: { po_id: poId, status: { [Op.in]: PENDING_STATUSES }, ...(excludeSesId ? { id: { [Op.ne]: excludeSesId } } : {}) }
    }],
    transaction
  });
  const reserved = {};
  for (const p of pending) reserved[p.po_item_id] = (reserved[p.po_item_id] || 0) + Number(p.quantity || 0);
  const open = {};
  for (const i of poItems) {
    open[i.id] = Math.max(0, Number(i.quantity || 0) - Number(i.received_quantity || 0) - (reserved[i.id] || 0));
  }
  return { poItems, open };
}

const detailIncludes = [
  {
    model: PurchaseOrder, attributes: ['id', 'po_number', 'total_amount', 'status', 'pr_id', 'type'],
    include: [{ model: PurchaseRequisition, attributes: ['id', 'pr_number'], required: false }]
  },
  { model: Vendor, attributes: ['id', 'vendor_name'] },
  { model: ServiceEntrySheetItem, as: 'items' },
  { model: Invoice, attributes: ['id', 'invoice_number', 'status', 'matching_status', 'total_amount'], required: false },
  { model: User, as: 'Creator', attributes: userAttrs },
  { model: User, as: 'Confirmer', attributes: userAttrs },
  { model: User, as: 'Reviewer', attributes: userAttrs },
  { model: User, as: 'Approver', attributes: userAttrs },
  { model: User, as: 'Rejecter', attributes: userAttrs }
];

const withActions = (ses, user) => ({ ...ses.toJSON(), allowed_actions: allowedActions(ses, user) });

/**
 * "own" SES scope (Requesters): the SES they recorded, plus every SES on a PO raised from one of
 * their requisitions - they are the ones who confirm the service was delivered.
 */
const ownPoIdsSql = (userId) => sequelize.literal(
  `(SELECT po.id FROM purchaseorders po JOIN purchaserequisitions pr ON pr.id = po.pr_id WHERE pr.requested_by_user_id = ${sequelize.escape(Number(userId))})`
);
async function sesScopeWhere(req) {
  if (readScope(req.user?.role, 'SES') !== 'own') return scopeWhere(req, 'SES', { owner: 'created_by', vendor: 'vendor_id' });
  return { [Op.or]: [{ created_by: req.user.id }, { po_id: { [Op.in]: ownPoIdsSql(req.user.id) } }] };
}
async function canSeeSes(req, ses) {
  if (readScope(req.user?.role, 'SES') !== 'own') return canSeeRow(req, 'SES', ses, { owner: 'created_by', vendor: 'vendor_id' });
  if (Number(ses.created_by) === Number(req.user.id)) return true;
  const po = await PurchaseOrder.findByPk(ses.po_id, { attributes: ['id'], include: [{ model: PurchaseRequisition, attributes: ['requested_by_user_id'], required: false }] });
  return Number(po?.PurchaseRequisition?.requested_by_user_id) === Number(req.user.id);
}

async function loadForUser(req, id, transaction) {
  const ses = await ServiceEntrySheet.findOne({
    where: { id, ...buildAdminWhere(req) },
    include: transaction ? [] : detailIncludes,
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (!ses || !(await canSeeSes(req, ses))) {
    throw new AppError('Service entry sheet not found', 404);
  }
  return ses;
}

/** Which POs a role may record service against: Requesters only POs from their own requisitions. */
async function poScopeWhere(req) {
  const scope = readScope(req.user?.role, 'SES');
  if (scope === 'own') return { id: { [Op.in]: ownPoIdsSql(req.user.id) } };
  if (scope === 'vendor') return scopeWhere(req, 'SES', { vendor: 'vendor_id' });
  return {};
}

// GET /api/procurement/ses/purchase-orders - issued POs with service still open for an SES
exports.getOpenPurchaseOrders = async (req, res, next) => {
  try {
    const pos = await PurchaseOrder.findAll({
      where: { status: { [Op.in]: OPEN_PO_STATUSES }, ...buildAdminWhere(req), ...(await poScopeWhere(req)) },
      include: [
        { model: Vendor, attributes: ['id', 'vendor_name'] },
        { model: PurchaseOrderItem, as: 'items' }
      ],
      order: [['createdAt', 'DESC']],
      limit: 200
    });
    const rows = [];
    for (const po of pos) {
      const { open } = await openQuantities(po.id);
      const items = (po.items || []).map((i) => ({ ...i.toJSON(), open_quantity: open[i.id] || 0 }));
      if (items.some((i) => i.open_quantity > 0)) rows.push({ ...po.toJSON(), items });
    }
    sendResponse(res, 200, rows);
  } catch (error) {
    next(error);
  }
};

// GET /api/procurement/ses?status=&po_id=
exports.getServiceEntrySheets = async (req, res, next) => {
  try {
    const { status, po_id } = req.query;
    const where = { ...buildAdminWhere(req), ...(await sesScopeWhere(req)) };
    if (status) where.status = String(status).split(',');
    if (po_id) where.po_id = po_id;
    const list = await ServiceEntrySheet.findAll({ where, include: detailIncludes, order: [['created_at', 'DESC']], limit: 500 });
    sendResponse(res, 200, list.map((s) => withActions(s, req.user)));
  } catch (error) {
    next(error);
  }
};

// GET /api/procurement/ses/:id
exports.getServiceEntrySheet = async (req, res, next) => {
  try {
    const ses = await loadForUser(req, req.params.id);
    sendResponse(res, 200, withActions(ses, req.user));
  } catch (error) {
    next(error);
  }
};

// POST /api/procurement/ses - step 1, Service Performed
exports.createServiceEntrySheet = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { po_id, items, service_period_from, service_period_to, service_description, performed_by, invoice_number } = req.body || {};
    if (!po_id) throw new AppError('Select the purchase order the service was performed against', 400);
    if (!service_period_from || !service_period_to) throw new AppError('Service period (from and to) is required', 400);
    if (new Date(service_period_to) < new Date(service_period_from)) throw new AppError('Service period "to" date is before the "from" date', 400);
    if (!String(service_description || '').trim()) throw new AppError('Describe the service performed', 400);

    const po = await PurchaseOrder.findOne({ where: { id: po_id, ...buildAdminWhere(req), ...(await poScopeWhere(req)) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!po) throw new AppError('Purchase Order not found', 404);
    if (!OPEN_PO_STATUSES.includes(po.status)) throw new AppError(`PO ${po.po_number} is ${po.status}; only issued or partly received POs can take a service entry`, 400);

    const { poItems, open } = await openQuantities(po.id, { transaction });
    const poItemById = new Map(poItems.map((i) => [Number(i.id), i]));
    const lines = [];
    for (const line of Array.isArray(items) ? items : []) {
      const qty = Number(line.quantity || 0);
      if (!(qty > 0)) continue;
      const poItem = poItemById.get(Number(line.po_item_id));
      if (!poItem) throw new AppError(`PO line ${line.po_item_id} is not on ${po.po_number}`, 400);
      const available = open[poItem.id] || 0;
      if (qty > available + 1e-9) {
        throw new AppError(`${poItem.item_name}: ${qty} entered but only ${available} is still open on the PO (ordered ${Number(poItem.quantity)}, received or pending on other service entries ${money(Number(poItem.quantity) - available)})`, 400);
      }
      lines.push({ poItem, qty, remarks: line.remarks || null });
    }
    if (!lines.length) throw new AppError('Enter the quantity of service performed on at least one PO line', 400);

    const clientId = getClientId(req) || po.client_id;
    const ses_number = await getNextNumber(clientId, 'SES', transaction);
    const total = money(lines.reduce((s, l) => s + l.qty * Number(l.poItem.unit_price || 0), 0));

    const ses = await ServiceEntrySheet.create({
      client_id: clientId,
      ses_number,
      po_id: po.id,
      vendor_id: po.vendor_id,
      entity_id: po.entity_id || null,
      property_id: po.property_id || null,
      location_id: po.location_id || null,
      service_period_from,
      service_period_to,
      service_description: String(service_description).trim(),
      performed_by: performed_by ? String(performed_by).trim() : null,
      invoice_number: invoice_number ? String(invoice_number).trim() : null,
      total_value: total,
      status: 'PENDING_CONFIRMATION',
      created_by: req.user.id
    }, { transaction });

    await ServiceEntrySheetItem.bulkCreate(lines.map((l) => ({
      client_id: clientId,
      ses_id: ses.id,
      po_item_id: l.poItem.id,
      item_name: l.poItem.item_name,
      ordered_quantity: l.poItem.quantity,
      quantity: l.qty,
      unit_price: l.poItem.unit_price,
      amount: money(l.qty * Number(l.poItem.unit_price || 0)),
      remarks: l.remarks
    })), { transaction });

    await transaction.commit();

    audit(req, ses, 'CREATE_SES', { po_number: po.po_number, total_value: total });
    const full = await loadForUser(req, ses.id);
    sendResponse(res, 201, withActions(full, req.user), `Service entry ${ses_number} recorded and sent for service confirmation`);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
};

/** Steps 2-4: confirm, review, approve. */
const advance = (stageKey) => async (req, res, next) => {
  const stage = STAGES[stageKey];
  const transaction = await sequelize.transaction();
  try {
    const ses = await loadForUser(req, req.params.id, transaction);
    const reason = blockReason(ses, stageKey, req.user);
    if (reason) throw new AppError(reason, 403);

    const remarks = req.body?.remarks ? String(req.body.remarks).trim() : null;
    let po = null;
    if (stageKey === 'approve') {
      // The accepted service now counts as received on the PO (same as an accepted GRN quantity).
      po = await PurchaseOrder.findOne({ where: { id: ses.po_id }, transaction, lock: transaction.LOCK.UPDATE });
      const items = await ServiceEntrySheetItem.findAll({ where: { ses_id: ses.id }, transaction });
      for (const item of items) {
        const poItem = await PurchaseOrderItem.findOne({ where: { id: item.po_item_id, po_id: ses.po_id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!poItem) throw new AppError(`PO line for ${item.item_name} no longer exists`, 409);
        const remaining = Number(poItem.quantity || 0) - Number(poItem.received_quantity || 0);
        if (Number(item.quantity) > remaining + 1e-9) {
          throw new AppError(`${item.item_name}: only ${remaining} is still open on the PO, but this SES accepts ${Number(item.quantity)}. Reject it and record a corrected SES.`, 409);
        }
        await poItem.increment('received_quantity', { by: Number(item.quantity), transaction });
      }
      const allItems = await PurchaseOrderItem.findAll({ where: { po_id: ses.po_id }, transaction });
      const full = allItems.length > 0 && allItems.every((i) => Number(i.received_quantity) >= Number(i.quantity));
      await po.update({ status: full ? 'RECEIVED' : 'PARTIAL_RECEIVED' }, { transaction });
    }

    await ses.update({
      status: stage.to,
      [stage.by]: req.user.id,
      [stage.at]: new Date(),
      [stage.remarks]: remarks
    }, { transaction });
    await transaction.commit();

    audit(req, ses, `SES_${stageKey.toUpperCase()}`, { remarks });

    const warnings = [];
    let invoice = null;
    if (stageKey === 'approve') invoice = await invoiceFromSes({ req, ses, po, warnings });

    const fresh = await loadForUser(req, ses.id);
    const message = stageKey === 'approve'
      ? (invoice ? `SES approved. Invoice ${invoice.invoice_number} moved to Invoice Processing` : 'SES approved; the service is now received on the PO')
      : `${stage.label} done; sent for ${STAGES[STAGE_BY_STATUS[stage.to]].label}`;
    sendResponse(res, 200, { ses: withActions(fresh, req.user), warnings, invoice }, message);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
};

exports.confirmServiceEntrySheet = advance('confirm');
exports.reviewServiceEntrySheet = advance('review');
exports.approveServiceEntrySheet = advance('approve');

// POST /api/procurement/ses/:id/reject - at any pending step, by whoever may act at that step
exports.rejectServiceEntrySheet = async (req, res, next) => {
  try {
    const reasonText = String(req.body?.reason || '').trim();
    if (!reasonText) throw new AppError('Give a reason for rejecting the service entry', 400);
    const ses = await loadForUser(req, req.params.id);
    const stageKey = STAGE_BY_STATUS[ses.status];
    if (!stageKey) throw new AppError(`This SES is already ${ses.status.toLowerCase()}`, 400);
    const blocked = blockReason(ses, stageKey, req.user, { rejecting: true });
    if (blocked) throw new AppError(blocked, 403);

    await ses.update({
      status: 'REJECTED',
      rejected_by: req.user.id,
      rejected_at: new Date(),
      rejected_stage: STAGES[stageKey].label,
      rejection_reason: reasonText
    });
    audit(req, ses, 'SES_REJECT', { stage: STAGES[stageKey].label, reason: reasonText });
    const fresh = await loadForUser(req, ses.id);
    sendResponse(res, 200, { ses: withActions(fresh, req.user) }, `Service entry ${ses.ses_number} rejected`);
  } catch (error) {
    next(error);
  }
};

/**
 * Hands an approved SES to Invoice Processing when it carries the vendor's invoice number:
 * creates the invoice at the SES value and runs the 3-way match (PO <-> SES <-> invoice).
 * Never fails the approval; problems come back as warnings so the invoice can be entered by hand.
 */
async function invoiceFromSes({ req, ses, po, warnings }) {
  const number = String(ses.invoice_number || '').trim();
  if (!number || !(Number(ses.total_value) > 0)) return null;
  try {
    const existing = await Invoice.findOne({ where: { invoice_number: number, client_id: ses.client_id } });
    if (existing) {
      warnings.push(`Invoice ${number} is already in Invoice Processing, so no new invoice was created for this SES.`);
      return null;
    }
    const { recordInvoice } = require('./procurement.controller');
    const { invoice } = await recordInvoice({
      po_id: ses.po_id,
      ses_id: ses.id,
      vendor_id: po?.vendor_id || ses.vendor_id,
      invoice_number: number,
      base_amount: money(ses.total_value),
      gst_amount: 0,
      invoice_date: ses.approved_at || new Date()
    }, req);
    return invoice;
  } catch (err) {
    warnings.push(`SES approved, but the invoice could not be moved to Invoice Processing automatically: ${err.message}`);
    return null;
  }
}

function audit(req, ses, action, metadata) {
  logActivity({
    module: 'PROCUREMENT', action, user_id: req.user.id, client_id: req.user.client_id,
    metadata: { ses_id: ses.id, ses_number: ses.ses_number, ...metadata }
  }).catch(() => {});
  ImmutableAuditService.log({
    clientId: ses.client_id, userId: req.user?.id, action, module: 'PROCUREMENT',
    entityType: 'SERVICE_ENTRY_SHEET', entityId: ses.id, afterData: ses.toJSON(), req
  });
}

exports.STAGES = STAGES;
exports.blockReason = blockReason;
