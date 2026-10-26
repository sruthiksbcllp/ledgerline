'use strict';

/**
 * Activity trail for the Accounts Payable documents.
 *
 * Model hooks record a WorkflowEvent whenever a tracked document is created or one of its tracked
 * fields (status, approval level, matching, exception, vendor ...) changes, naming the person from
 * the request context (utils/requestContext): their role in this company and their name, the
 * action, the status before and after, and the time. Approval-log rows and AP payments add events
 * to the document they belong to. Several changes to one document in one request (for example a
 * payment row plus the invoice moving to PAID) are merged into a single event.
 *
 * Because it hangs off the models, every code path is covered (controllers, services, email-link
 * approvals) without each one having to remember to log.
 */
const requestContext = require('../utils/requestContext');

/** module -> how to recognise it. `fields` are the columns whose change is a workflow step. */
const TRACKED = {
  PurchaseRequisition: { module: 'PR', number: 'pr_number', fields: ['status', 'current_level'], created: 'Requisition raised' },
  Rfq: { module: 'RFQ', number: 'rfq_number', fields: ['status'], created: 'RFQ created' },
  Quotation: { module: 'QUOTATION', number: 'quotation_number', fields: ['status'], created: 'Quotation recorded' },
  PurchaseOrder: { module: 'PO', number: 'po_number', fields: ['status', 'current_level', 'vendor_id'], created: 'Purchase order created' },
  GateEntry: { module: 'GATE_ENTRY', number: 'gate_entry_number', fields: ['status', 'qc_status'], created: 'Gate entry recorded' },
  GRN: { module: 'GRN', number: 'grn_number', fields: ['status'], created: 'Goods received (GRN created)' },
  ServiceEntrySheet: { module: 'SES', number: 'ses_number', fields: ['status'], created: 'Service recorded' },
  Invoice: { module: 'INVOICE', number: 'invoice_number', fields: ['status', 'matching_status', 'exception_status', 'payment_blocked'], created: 'Invoice recorded' },
  VendorDebitNote: { module: 'DEBIT_NOTE', number: 'debit_note_number', fields: ['status'], created: 'Debit note drafted' }
};
const MODULES = Object.values(TRACKED).map((t) => t.module);

/** Which document a request path acts on, so its verb (approve, reject ...) names the action. */
const PATH_MODULE = [
  [/\/procurement\/ses(\/|$)/, 'SES'],
  [/\/procurement\/pr(\/|$)/, 'PR'],
  [/\/procurement\/quotations(\/|$)/, 'QUOTATION'],
  [/\/procurement\/po(\/|$)/, 'PO'],
  [/\/procurement\/gate-entries(\/|$)/, 'GATE_ENTRY'],
  [/\/(procurement\/grn|grn)(\/|$)/, 'GRN'],
  [/\/procurement\/(ap-)?invoices(\/|$)/, 'INVOICE'],
  [/\/three-way-match(\/|$)/, 'INVOICE'],
  [/\/rfqs(\/|$)/, 'RFQ'],
  [/\/approvals\/pr\//i, 'PR'],
  [/\/approvals\/po\//i, 'PO']
];
const pathModule = (path) => (PATH_MODULE.find(([re]) => re.test(path)) || [])[1] || null;

/** Last meaningful path word -> action. */
const VERBS = {
  approve: 'Approved', reject: 'Rejected', cancel: 'Cancelled', submit: 'Submitted for approval',
  confirm: 'Service confirmed', review: 'Reviewed and forwarded for approval', send: 'Sent to vendors',
  'send-to-vendor': 'Sent to vendor', 'change-vendor': 'Vendor changed (sent for re-approval)',
  'resolve-exception': 'Exception resolved', 'approve-for-payment': 'Approved for payment',
  'record-external-payment': 'External payment recorded', 'mark-paid': 'Marked as paid',
  payments: 'Payment recorded', close: 'Closed', award: 'Awarded', match: 'Three-way match run',
  status: 'Status updated', response: 'Vendor response recorded'
};

/** New status -> action, when the path does not say. */
const STATUS_ACTIONS = {
  SUBMITTED: 'Submitted for approval', PENDING_APPROVAL: 'Sent for approval', IN_APPROVAL: 'In approval',
  APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled', ISSUED: 'Issued',
  PO_CREATED: 'Purchase order raised', PARTIAL_RECEIVED: 'Goods partly received', RECEIVED: 'Goods received',
  CLOSED: 'Closed', COMPLETED: 'Completed', PENDING_CONFIGURATION: 'Waiting for approval set-up',
  QC_COMPLETED: 'Quality check completed', GRN_CREATED: 'GRN created', PENDING_REVIEW: 'Service confirmed',
  APPROVED_FOR_PAYMENT: 'Approved for payment', WAITING_FOR_PAYMENT: 'Waiting for payment',
  PARTIAL: 'Part payment recorded', PAID: 'Paid in full', EXCEPTION: 'Exception raised',
  POSTED: 'Posted', SENT: 'Sent to vendors', PARTIALLY_RESPONDED: 'Vendor responses received', NOT_APPROVED: 'Not approved'
};

const FIELD_ACTIONS = {
  current_level: (from, to) => `Approved at level ${from ?? 0}, moved to level ${to}`,
  vendor_id: () => 'Vendor changed',
  matching_status: (from, to) => `Three-way match: ${String(to).toLowerCase()}`,
  exception_status: (from, to) => (to === 'OPEN' ? 'Exception opened' : to === 'MANUAL_APPROVED' ? 'Exception approved manually' : `Exception ${String(to).toLowerCase()}`),
  payment_blocked: (from, to) => (to ? 'Payment blocked' : 'Payment unblocked'),
  qc_status: (from, to) => `Quality check ${String(to).toLowerCase()}`
};

const COMMENT_KEYS = ['comments', 'comment', 'remarks', 'reason', 'deviation_reason', 'justification', 'confirmation_remarks', 'review_remarks', 'approval_remarks', 'rejection_reason', 'cancel_reason', 'cancellation_reason', 'notes', 'note', 'resolution_note'];

// ---------------------------------------------------------------- people and roles

const PLATFORM_ROLE_NAMES = { PROVIDER_ADMIN: 'Super Admin', DEV_ADMIN: 'Super Admin' };
let roleNames = null;
let roleNamesAt = 0;
const userCache = new Map(); // id -> { name, at }
const CACHE_MS = 60 * 1000;

const humanize = (code) => String(code || '').toLowerCase().split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

async function roleNameOf(code, models) {
  if (!code) return null;
  const key = String(code).toUpperCase();
  if (PLATFORM_ROLE_NAMES[key]) return PLATFORM_ROLE_NAMES[key];
  if (!roleNames || Date.now() - roleNamesAt > 5 * CACHE_MS) {
    const rows = await models.Role.findAll({ attributes: ['code', 'name'], raw: true }).catch(() => []);
    roleNames = Object.fromEntries(rows.map((r) => [String(r.code).toUpperCase(), r.name]));
    roleNamesAt = Date.now();
  }
  if (roleNames[key]) return roleNames[key];
  const { findRole } = require('../config/rbac');
  return findRole(key)?.name || humanize(key);
}

async function userNameOf(id, models) {
  if (!id) return null;
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.name;
  const u = await models.User.findByPk(id, { attributes: ['first_name', 'last_name', 'username', 'email'], raw: true }).catch(() => null);
  const name = u ? (`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || u.email) : `User #${id}`;
  userCache.set(id, { name, at: Date.now() });
  return name;
}

/** A user's role in a company: their membership there, else their account role. */
async function roleCodeOf(userId, clientId, models) {
  if (!userId) return null;
  if (clientId && models.CompanyMembership) {
    const m = await models.CompanyMembership.findOne({ where: { user_id: userId, client_id: clientId, status: 'ACTIVE' }, attributes: ['role_code'], raw: true }).catch(() => null);
    if (m?.role_code) return m.role_code;
  }
  const u = await models.User.findByPk(userId, { attributes: ['role_id'], include: [{ model: models.Role, as: 'Role', attributes: ['code'] }] }).catch(() => null);
  return u?.Role?.code || null;
}

/** The person acting: explicit actor > request context > system. */
async function resolveActor(models, explicit, clientId) {
  const ctx = requestContext.current();
  const a = { ...(ctx?.actor || {}), ...(explicit || {}) };
  if (!a.user_id && !a.user_name) return { user_id: null, user_name: 'System', role_code: null, role_name: 'Automated', source: 'SYSTEM' };
  if (a.user_id && !a.role_code && !a.role_name) a.role_code = await roleCodeOf(a.user_id, clientId ?? a.client_id, models);
  return {
    user_id: a.user_id || null,
    user_name: a.user_name || await userNameOf(a.user_id, models),
    role_code: a.role_code || null,
    role_name: a.role_name || await roleNameOf(a.role_code, models),
    source: a.source || 'APP'
  };
}

function requestComment(module) {
  const ctx = requestContext.current();
  if (ctx?.comment) return String(ctx.comment).slice(0, 2000);
  if (!ctx?.request || pathModule(ctx.request.path) !== module) return null;
  const body = ctx.request.body || {};
  for (const k of COMMENT_KEYS) {
    if (body[k] && typeof body[k] === 'string' && body[k].trim()) return body[k].trim().slice(0, 2000);
  }
  return null;
}

function requestVerb(module) {
  const ctx = requestContext.current();
  if (!ctx?.request || ctx.request.method === 'GET') return null;
  if (pathModule(ctx.request.path) !== module) return null;
  const words = ctx.request.path.split('/').filter((w) => w && !/^\d+$/.test(w));
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (VERBS[words[i]]) return VERBS[words[i]];
  }
  return null;
}

// ---------------------------------------------------------------- recording

/**
 * Write (or merge into this request's earlier) event for a document.
 * ev: { module, reference_id, reference_no, client_id, action, from_status, to_status, comments, details, priority, actor }
 */
async function record(models, ev, transaction) {
  if (!ev.reference_id) return null;
  const ctx = requestContext.current();
  const key = `${ev.module}:${ev.reference_id}`;
  const seen = ctx ? (ctx.workflowEvents = ctx.workflowEvents || new Map()) : null;
  const prior = seen && seen.get(key);
  const opts = transaction ? { transaction } : {};

  if (prior) {
    const patch = {};
    if (ev.to_status && ev.to_status !== prior.row.to_status) patch.to_status = ev.to_status;
    if (ev.from_status && !prior.row.from_status) patch.from_status = ev.from_status;
    if ((ev.priority || 0) > prior.priority && ev.action !== prior.row.action) {
      // Keep "raised" visible when the same request also moves the new document on.
      patch.action = (prior.createdAction ? `${prior.createdAction} · ${ev.action}` : ev.action).slice(0, 120);
      prior.priority = ev.priority;
    }
    if (ev.comments && !prior.row.comments) patch.comments = ev.comments;
    if (ev.details) {
      const merged = { ...(prior.row.details || {}) };
      for (const [k, v] of Object.entries(ev.details)) {
        merged[k] = Array.isArray(v) && Array.isArray(merged[k]) ? [...new Set([...merged[k], ...v])] : v;
      }
      patch.details = merged;
    }
    if (ev.reference_no && !prior.row.reference_no) patch.reference_no = ev.reference_no;
    if (Object.keys(patch).length) {
      Object.assign(prior.row, patch);
      await models.WorkflowEvent.update(patch, { where: { id: prior.row.id }, ...opts }).catch(() => {});
    }
    return prior.row;
  }

  const actor = await resolveActor(models, ev.actor, ev.client_id);
  const row = await models.WorkflowEvent.create({
    client_id: ev.client_id ?? ctx?.actor?.client_id ?? null,
    module: ev.module,
    reference_id: ev.reference_id,
    reference_no: ev.reference_no || null,
    action: String(ev.action || 'Updated').slice(0, 120),
    from_status: ev.from_status != null ? String(ev.from_status) : null,
    to_status: ev.to_status != null ? String(ev.to_status) : null,
    user_id: actor.user_id,
    user_name: actor.user_name,
    role_code: actor.role_code,
    role_name: actor.role_name,
    comments: ev.comments || null,
    details: ev.details || null,
    source: actor.source,
    occurred_at: new Date()
  }, opts);
  if (seen) seen.set(key, { row: row.get({ plain: true }), priority: ev.priority || 0, createdAction: ev.created ? ev.action : null });
  return row;
}

const safe = (fn) => async (...args) => {
  try { await fn(...args); } catch (e) {
    // The trail must never break the business action itself.
    console.error('[workflow-trail]', e.message);
  }
};

const valueOf = (v) => (typeof v === 'boolean' ? v : v == null ? null : v);

function install(models) {
  if (!models.WorkflowEvent) return;

  for (const [modelName, cfg] of Object.entries(TRACKED)) {
    const Model = models[modelName];
    if (!Model) continue;
    const fields = cfg.fields.filter((f) => Model.rawAttributes[f]);

    Model.addHook('afterCreate', 'workflowTrail', safe(async (row, options) => {
      const status = row.get('status');
      await record(models, {
        module: cfg.module,
        reference_id: row.id,
        reference_no: row.get(cfg.number),
        client_id: row.get('client_id'),
        action: cfg.created,
        created: true,
        from_status: null,
        to_status: status,
        comments: requestComment(cfg.module),
        priority: 1
      }, options.transaction);
    }));

    Model.addHook('beforeUpdate', 'workflowTrail', (row) => {
      const changes = {};
      for (const f of fields) {
        if (!row.changed(f)) continue;
        const from = valueOf(row.previous(f));
        const to = valueOf(row.get(f));
        if (String(from) !== String(to)) changes[f] = [from, to];
      }
      row._workflowChanges = changes;
    });

    Model.addHook('afterUpdate', 'workflowTrail', safe(async (row, options) => {
      const changes = row._workflowChanges || {};
      delete row._workflowChanges;
      const changed = Object.keys(changes);
      if (!changed.length) return;
      const status = changes.status;
      let action = requestVerb(cfg.module);
      let priority = action ? 2 : 1;
      if (!action && status) action = STATUS_ACTIONS[status[1]] || `Status changed to ${humanize(status[1])}`;
      if (!action) {
        const f = changed[0];
        action = FIELD_ACTIONS[f] ? FIELD_ACTIONS[f](changes[f][0], changes[f][1]) : `${humanize(f)} changed`;
      }
      const details = Object.fromEntries(changed.filter((f) => f !== 'status').map((f) => [f, { from: changes[f][0], to: changes[f][1] }]));
      await record(models, {
        module: cfg.module,
        reference_id: row.id,
        reference_no: row.get(cfg.number),
        client_id: row.get('client_id'),
        action,
        from_status: status ? status[0] : row.get('status'),
        to_status: row.get('status'),
        comments: requestComment(cfg.module),
        details: Object.keys(details).length ? details : null,
        priority
      }, options.transaction);
    }));

    // Model.update({ status }, { where }) skips per-row hooks; switch them on when a tracked field moves.
    Model.addHook('beforeBulkUpdate', 'workflowTrail', (options) => {
      const attrs = options.attributes || {};
      if (fields.some((f) => Object.prototype.hasOwnProperty.call(attrs, f))) options.individualHooks = true;
    });
  }

  // Approval decisions name the level and the approver precisely.
  if (models.ApprovalLog) {
    const LOG_ACTIONS = {
      SUBMITTED: 'Submitted for approval', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled',
      UPDATED: 'Updated', ESCALATED: 'Escalated', CONFIGURATION_REQUIRED: 'Waiting for approval set-up'
    };
    models.ApprovalLog.addHook('afterCreate', 'workflowTrail', safe(async (log, options) => {
      const module = String(log.module || '').toUpperCase();
      if (!MODULES.includes(module)) return;
      const base = LOG_ACTIONS[log.action] || humanize(log.action);
      const action = log.action === 'APPROVED' && log.level ? `${base} (level ${log.level})` : base;
      await record(models, {
        module,
        reference_id: log.reference_id,
        client_id: log.client_id,
        action,
        comments: log.comments || null,
        priority: 3,
        actor: log.user_id ? { user_id: log.user_id, role_code: log.role_code || requestContext.current()?.actor?.role_code } : undefined
      }, options.transaction);
    }));
  }

  // Delegation-of-authority approvals (in-app or by email link) name each level's approver.
  if (models.DoaApprovalStep && models.DoaApprovalRequest) {
    models.DoaApprovalStep.addHook('afterUpdate', 'workflowTrail', safe(async (step, options) => {
      if (!step.changed('status') || step.get('status') === 'PENDING') return;
      const reqRow = await models.DoaApprovalRequest.findByPk(step.request_id, { attributes: ['module', 'document_id', 'client_id'], transaction: options.transaction });
      const module = String(reqRow?.module || '').toUpperCase();
      if (!reqRow || !MODULES.includes(module)) return;
      const ctxActor = requestContext.current()?.actor;
      const actor = step.decided_user_id
        ? { user_id: step.decided_user_id, role_code: Number(ctxActor?.user_id) === Number(step.decided_user_id) ? ctxActor.role_code : null }
        : (ctxActor?.user_id || ctxActor?.user_name ? undefined
          : { user_name: step.approver_name || step.decided_email || step.approver_email, role_name: 'External Approver (email link)', source: 'EMAIL_LINK' });
      await record(models, {
        module,
        reference_id: reqRow.document_id,
        client_id: reqRow.client_id,
        action: `${step.status === 'APPROVED' ? 'Approved' : 'Rejected'} (level ${step.level})`,
        comments: step.comment || null,
        priority: 3,
        actor
      }, options.transaction);
    }));
  }

  // RFQ invitations and vendor responses land on the RFQ's trail.
  if (models.RfqVendor) {
    const INVITE_ACTIONS = { SENT: 'RFQ sent to vendors', RESPONDED: 'Vendor response recorded', DECLINED: 'Vendor declined' };
    const vendorName = async (id) => (await models.Vendor.findByPk(id, { attributes: ['vendor_name'], raw: true }).catch(() => null))?.vendor_name || `Vendor #${id}`;
    models.RfqVendor.addHook('afterCreate', 'workflowTrail', safe(async (rv, options) => {
      await record(models, {
        module: 'RFQ', reference_id: rv.rfq_id, client_id: rv.client_id,
        action: 'Vendors added', details: { vendors: [await vendorName(rv.vendor_id)] }, priority: 0
      }, options.transaction);
    }));
    models.RfqVendor.addHook('afterUpdate', 'workflowTrail', safe(async (rv, options) => {
      if (!rv.changed('invite_status') || !INVITE_ACTIONS[rv.invite_status]) return;
      await record(models, {
        module: 'RFQ', reference_id: rv.rfq_id, client_id: rv.client_id,
        action: INVITE_ACTIONS[rv.invite_status], details: { vendors: [await vendorName(rv.vendor_id)] }, priority: 1
      }, options.transaction);
    }));
  }

  // Three-way match results land on the invoice's trail.
  if (models.ThreeWayMatch) {
    const MATCH_ACTIONS = { MATCHED: 'Three-way match: matched', TOLERANCE_BREACH: 'Three-way match: outside tolerance', BLOCKED: 'Three-way match: payment blocked', PENDING: 'Three-way match pending' };
    const onMatch = safe(async (m, options, created) => {
      if (!created && !m.changed('status')) return;
      if (!m.invoice_id) return;
      await record(models, {
        module: 'INVOICE', reference_id: m.invoice_id, client_id: m.client_id,
        action: MATCH_ACTIONS[m.status] || `Three-way match: ${humanize(m.status)}`,
        details: { match_status: m.status }, comments: m.blocked_reason || null, priority: 1
      }, options.transaction);
    });
    models.ThreeWayMatch.addHook('afterCreate', 'workflowTrail', (m, o) => onMatch(m, o, true));
    models.ThreeWayMatch.addHook('afterUpdate', 'workflowTrail', (m, o) => onMatch(m, o, false));
  }

  // AP payments land on the invoice's trail.
  if (models.ApPayment) {
    models.ApPayment.addHook('afterCreate', 'workflowTrail', safe(async (p, options) => {
      await record(models, {
        module: 'INVOICE',
        reference_id: p.invoice_id,
        client_id: p.client_id,
        action: `Payment recorded`,
        details: { amount: Number(p.amount), payment_mode: p.payment_mode || null, reference: p.reference || null, payment_date: p.payment_date },
        comments: p.notes || null,
        priority: 3
      }, options.transaction);
    }));
  }
}

// ---------------------------------------------------------------- reading

const plain = (r) => ({
  id: r.id,
  module: r.module,
  reference_id: r.reference_id,
  reference_no: r.reference_no,
  action: r.action,
  from_status: r.from_status,
  to_status: r.to_status,
  user_id: r.user_id,
  user_name: r.user_name,
  role_code: r.role_code,
  role_name: r.role_name,
  comments: r.comments,
  details: r.details,
  source: r.source,
  occurred_at: r.occurred_at
});

/** Full trail of one document, oldest first. */
async function trailOf(models, { clientId, module, id }) {
  const where = { module, reference_id: id };
  if (clientId != null) where.client_id = clientId;
  const rows = await models.WorkflowEvent.findAll({ where, order: [['occurred_at', 'ASC'], ['id', 'ASC']], raw: true });
  return rows.map(plain);
}

/** Most recent event for each of several documents: { [id]: event }. */
async function latestOf(models, { clientId, module, ids }) {
  const list = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  if (!list.length) return {};
  const { Op } = require('sequelize');
  const where = { module, reference_id: { [Op.in]: list } };
  if (clientId != null) where.client_id = clientId;
  const rows = await models.WorkflowEvent.findAll({ where, order: [['occurred_at', 'DESC'], ['id', 'DESC']], raw: true });
  const out = {};
  for (const r of rows) if (!out[r.reference_id]) out[r.reference_id] = plain(r);
  return out;
}

module.exports = { install, record, trailOf, latestOf, TRACKED, MODULES, roleNameOf, userNameOf };
