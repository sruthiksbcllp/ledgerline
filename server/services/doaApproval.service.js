'use strict';
/**
 * DOA Phase 2b-1 — DOA approval state machine (parallel track).
 * Builds a doa_approval_request + steps from the resolver chain, and records each step's
 * decision (single approver, or 1-of-N for ANY_ONE_OF). The request is APPROVED only when
 * every step is APPROVED; a single REJECTED step rejects the whole request.
 * Does NOT touch the matrix engine. Wiring into initiateApproval + email dispatch = 2b-2.
 */
const { getApproverChain } = require('./doaResolver.service');

/** Pure: roll up step statuses into a request status. */
function computeRequestStatus(steps) {
  if (steps.some((s) => s.status === 'REJECTED')) return 'REJECTED';
  if (steps.length > 0 && steps.every((s) => s.status === 'APPROVED')) return 'APPROVED';
  return 'IN_PROGRESS';
}

/** Pure: map resolver requirements -> step rows. */
function buildSteps(requirements, clientId) {
  return (requirements || []).map((r, i) => {
    if (r.type === 'ANY_ONE_OF') {
      return { client_id: clientId, seq: i + 1, level: r.level || 1, requirement_type: 'ANY_ONE_OF', spec_type: 'ANY_ONE_OF_GROUP',
        group_key: r.group_key || null, eligible_json: JSON.stringify(r.eligible || []), status: 'PENDING' };
    }
    return { client_id: clientId, seq: i + 1, level: r.level || 1, requirement_type: 'SINGLE', spec_type: r.spec_type || 'NAMED',
      approver_name: r.approver_name || null, approver_email: r.approver_email || null, user_id: r.user_id || null, status: 'PENDING' };
  });
}

/**
 * Resolve the chain and persist a DOA request + steps. Returns { noPolicy:true } when the
 * tenant has no DOA policy (caller then falls back to matrix-mode).
 */
async function startDoaApproval({ clientId, module, documentId, expenseType, amount, departmentId = null, createdBy = null, manualApprovers = [] }, options = {}, models = null) {
  const db = models || require('../models');
  const { DoaApprovalRequest, DoaApprovalStep } = db;
  const chain = await getApproverChain(clientId, expenseType, amount, departmentId, db);
  if (!chain) return { noPolicy: true };

  // Phase 3b: resolve MANUAL levels from the approver the initiator picked at submit
  // (manualApprovers = [{ level, approver_name, approver_email }]). A manual level with
  // no selection stays unresolved (won't dispatch) — same safe behaviour as an unmapped head.
  if (Array.isArray(manualApprovers) && manualApprovers.length && chain.requirements) {
    const byLevel = new Map(manualApprovers.map((m) => [Number(m.level), m]));
    for (const r of chain.requirements) {
      if (r.type === 'SINGLE' && r.spec_type === 'MANUAL' && byLevel.has(Number(r.level))) {
        const m = byLevel.get(Number(r.level));
        r.approver_name = m.approver_name || r.approver_name || 'Approver';
        r.approver_email = m.approver_email || r.approver_email;
      }
    }
  }

  // Phase 3a: resolve dynamic heads to the PO department's mapped head (doa_department_heads).
  if (departmentId && chain.requirements && db.DoaDepartmentHead) {
    try {
      const dh = await db.DoaDepartmentHead.findOne({ where: { client_id: clientId, department_id: departmentId } });
      if (dh) {
        for (const r of chain.requirements) {
          if (r.type === 'SINGLE' && r.spec_type === 'DYNAMIC_INITIATOR_HEAD') {
            r.approver_name = dh.sublob_head_name || r.approver_name || 'Sub-LoB Head';
            r.approver_email = dh.sublob_head_email || r.approver_email;
          } else if (r.type === 'SINGLE' && r.spec_type === 'DYNAMIC_FACILITATOR_HEAD') {
            r.approver_name = dh.facilitator_head_name || r.approver_name || 'Facilitator Head';
            r.approver_email = dh.facilitator_head_email || r.approver_email;
          }
        }
      }
    } catch (e) { /* mapping absent -> dynamic steps stay unresolved (won't dispatch) */ }
  }

  const request = await DoaApprovalRequest.create({
    client_id: clientId, module, document_id: documentId, expense_type: expenseType,
    amount, policy_id: chain.policy_id, status: 'IN_PROGRESS', created_by: createdBy
  }, options);

  const stepRows = buildSteps(chain.requirements, clientId).map((s) => ({ ...s, request_id: request.id }));
  const steps = [];
  for (const s of stepRows) steps.push(await DoaApprovalStep.create(s, options));
  return { request, steps, requirements: chain.requirements };
}

/**
 * Record a decision on one step, then roll up the request (and signal doc completion).
 * For ANY_ONE_OF, an approval from any eligible member satisfies the step.
 */
async function recordStepDecision(step, decision, { byEmail = null, byUserId = null, ip = null, comment = null } = {}, options = {}, models = null) {
  const db = models || require('../models');
  const { DoaApprovalRequest, DoaApprovalStep } = db;
  if (!['APPROVED', 'REJECTED'].includes(decision)) return { ok: false, reason: 'BAD_DECISION' };
  if (step.status !== 'PENDING') return { ok: false, reason: 'ALREADY_DECIDED' };

  await step.update({ status: decision, decided_email: byEmail, decided_user_id: byUserId, decided_at: new Date(), decided_ip: ip, comment }, options);

  const steps = await DoaApprovalStep.findAll({ where: { request_id: step.request_id }, ...(options.transaction ? { transaction: options.transaction } : {}) });
  const requestStatus = computeRequestStatus(steps.map((s) => ({ status: s.status })));
  let nextLevel = null;
  if (requestStatus !== 'IN_PROGRESS') {
    const req = await DoaApprovalRequest.findByPk(step.request_id, options.transaction ? { transaction: options.transaction } : {});
    if (req && req.status === 'IN_PROGRESS') await req.update({ status: requestStatus }, options);
  } else {
    // still in progress: if the just-decided level is now fully approved, signal the next level to dispatch
    const curLevel = step.level;
    const levelDone = steps.filter((s) => s.level === curLevel).every((s) => s.status === 'APPROVED');
    if (levelDone) {
      const pend = [...new Set(steps.filter((s) => s.status === 'PENDING').map((s) => s.level))].sort((a, b) => a - b);
      nextLevel = pend.length ? pend[0] : null;
    }
  }
  return { ok: true, stepStatus: decision, requestStatus, nextLevel };
}


/** Tenant-aware DOA_APPROVALS flag: tenant row -> global -> default OFF. */
async function isDoaEnabled(clientId, models = null) {
  const db = models || require('../models');
  try {
    let tog = clientId ? await db.FeatureToggle.findOne({ where: { feature_key: 'DOA_APPROVALS', client_id: clientId } }) : null;
    if (!tog) tog = await db.FeatureToggle.findOne({ where: { feature_key: 'DOA_APPROVALS', client_id: null } });
    return !!(tog && tog.is_enabled);
  } catch (e) { return false; }
}

/**
 * Post-commit: issue a single-use email-link token per approver of each PENDING step and
 * send the request via SES. SINGLE -> the named approver; ANY_ONE_OF -> every eligible
 * member (first to act wins). Fully fail-open (never throws to the caller).
 */
async function dispatchLevel(requestId, level, models = null) {
  const db = models || require('../models');
  const { DoaApprovalRequest, DoaApprovalStep, PurchaseOrder, Vendor } = db;
  const dispatch = require('./emailApprovalDispatch.service');
  try {
    const request = await DoaApprovalRequest.findByPk(requestId);
    if (!request) return { sent: 0 };
    const all = await DoaApprovalStep.findAll({ where: { request_id: requestId } });
    const steps = all.filter((s) => s.status === 'PENDING' && (level == null || s.level === level));
    let reference = request.module + ' #' + request.document_id, amount = request.amount, vendorName = null, comment = null;
    if (request.module === 'PO') {
      const po = await PurchaseOrder.findOne({ where: { id: request.document_id }, include: [{ model: Vendor }] });
      if (po) { reference = po.po_number || reference; amount = po.total_amount; vendorName = po.Vendor && po.Vendor.vendor_name; comment = po.approval_comment || null; }
    }
    let sent = 0;
    for (const step of steps) {
      const recipients = [];
      if (step.requirement_type === 'ANY_ONE_OF') {
        let eligible = [];
        try { eligible = JSON.parse(step.eligible_json || '[]'); } catch (e) { eligible = []; }
        for (const m of eligible) if (m.approver_email) recipients.push({ email: m.approver_email, name: m.approver_name });
      } else if (step.approver_email) {
        recipients.push({ email: step.approver_email, name: step.approver_name });
      }
      for (const r of recipients) {
        try {
          await dispatch.dispatchApprovalRequest({ clientId: request.client_id, module: request.module, documentId: request.document_id, approverEmail: r.email, approverName: r.name, reference, amount, vendorName, comment, createdBy: request.created_by, stepId: step.id });
          sent++;
        } catch (e) { /* fail-open per recipient */ }
      }
    }
    return { sent };
  } catch (e) { return { sent: 0, error: e.message }; }
}

/** Initial dispatch: the LOWEST pending level only (levels then advance one at a time). */
async function dispatchRequestEmails(requestId, models = null) {
  const db = models || require('../models');
  const { DoaApprovalStep } = db;
  try {
    const steps = await DoaApprovalStep.findAll({ where: { request_id: requestId } });
    const pend = [...new Set(steps.filter((s) => s.status === 'PENDING').map((s) => s.level))].sort((a, b) => a - b);
    if (!pend.length) return { sent: 0 };
    return dispatchLevel(requestId, pend[0], db);
  } catch (e) { return { sent: 0, error: e.message }; }
}

module.exports = { computeRequestStatus, buildSteps, startDoaApproval, recordStepDecision, isDoaEnabled, dispatchRequestEmails, dispatchLevel };
