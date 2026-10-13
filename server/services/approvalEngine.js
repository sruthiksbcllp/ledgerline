'use strict';

/**
 * Universal Approval Engine — FT-002 Batch 2B-1 (tenant-aware).
 * Multi-level, role-based, amount-based approvals for any module.
 *
 * 2B-1 changes vs legacy:
 *  - D1: resolution via getApplicableRulesForTenant (tenant -> provider-default -> PENDING_CONFIGURATION),
 *        never the client-blind getApplicableRules.
 *  - AUTO_APPROVE provider-default semantics preserve legacy "no workflow -> auto-approve".
 *  - APPROVALS_REQUIRE_WORKFLOW=true: a tenant with ONLY the provider-default auto-approve parks the
 *        document in PENDING_CONFIGURATION (strict governance). Default OFF = legacy behavior.
 *  - D2: every log written via writeApprovalLog (client_id + workflow_id attribution).
 *  - D3: atomic status_lock (conditional UPDATE ... WHERE status_lock=false).
 *  - D4: privileged bypass narrowed to PROVIDER_ADMIN only, and the bypass is recorded.
 *  - D5: processApproval verifies the resolved workflow belongs to the caller's tenant (or is the
 *        provider-default, client_id IS NULL), else records a tenant-isolation violation and denies.
 */
const { ApprovalWorkflow, ApprovalMatrix, ApprovalLog, PurchaseRequisitionItem, sequelize } = require('../models');
const { Op } = require('sequelize');
const { getApplicableRulesForTenant, writeApprovalLog, PENDING_CONFIGURATION } = require('../utils/approvalTenancy');
const { recordTenantViolation } = require('../utils/securityEvents');

const MATRIX_ATTRS = ['id', 'workflow_id', 'module_name', 'level', 'role', 'role_code', 'min_amount', 'max_amount', 'is_mandatory', 'is_active'];

/** A provider-default whose every active rule is AUTO_APPROVE = legacy auto-approve semantics. */
const isAutoApprove = (rules) =>
  Array.isArray(rules) && rules.length > 0 &&
  rules.every(r => String(r.role_code || '').toUpperCase() === 'AUTO_APPROVE');

/**
 * LEGACY — client-blind resolver. RETAINED for export compatibility only; NOT used by the engine
 * anymore (2B-1 resolves via getApplicableRulesForTenant). Do not call in new code.
 */
const getApplicableRules = async (moduleName, amount) => {
  const workflow = await ApprovalWorkflow.findOne({
    where: { module: moduleName.toUpperCase(), status: 'ACTIVE' },
    include: [{
      model: ApprovalMatrix, as: 'matrix', attributes: MATRIX_ATTRS,
      where: { is_active: true, min_amount: { [Op.lte]: amount }, [Op.or]: [{ max_amount: null }, { max_amount: { [Op.gte]: amount } }] },
      required: true
    }]
  });
  if (!workflow) return null;
  return { workflow, rules: workflow.matrix.sort((a, b) => a.level - b.level) };
};

/**
 * Initiate approval for a document. Tenant-aware (D1).
 * @param {Object} document   Sequelize instance (PR/PO/Request)
 * @param {string} moduleName 'PR' | 'PO' | 'REQUEST'
 * @param {number} amount     document total
 * @param {number} userId     submitting user id
 * @param {Object} transaction Sequelize transaction
 * @param {number|null} clientId REQUIRED — tenant id from getClientId(req)
 */
const initiateApproval = async (document, moduleName, amount, userId, transaction, clientId) => {
  if (!clientId) throw new Error('clientId is required for the approval engine (forgotten call-site?)');

  // DOA policy-mode (ADDITIVE, flag-gated, PO-only). Falls through to the existing
  // matrix-mode below when DOA_APPROVALS is off, the tenant has no DOA policy, or this
  // is not a typed PO. Flag OFF => one toggle read + fall-through => behaviour unchanged.
  if (moduleName === 'PO' && document.type) {
    const doaSvc = require('./doaApproval.service');
    if (await doaSvc.isDoaEnabled(clientId)) {
      const doaRes = await doaSvc.startDoaApproval({ clientId, module: 'PO', documentId: document.id, expenseType: document.type, departmentId: document.department_id, amount, createdBy: userId, manualApprovers: document.doaManualApprovers || [] }, { transaction });
      if (!doaRes.noPolicy) {
        await document.update({ status: 'IN_APPROVAL', is_fully_approved: false, current_approval_level: 0, total_approval_levels: doaRes.steps.length }, { transaction });
        return { doa: true, request_id: doaRes.request.id, steps: doaRes.steps.length };
      }
    }
  }

  const res = await getApplicableRulesForTenant(moduleName, amount, clientId);
  const requireWorkflow = process.env.APPROVALS_REQUIRE_WORKFLOW === 'true';

  // (1) No tenant workflow AND no provider-default → park. Never silent-approve.
  if (res.pendingConfiguration) {
    await document.update(
      { status: PENDING_CONFIGURATION, is_fully_approved: false, current_approval_level: 0, total_approval_levels: 0 },
      { transaction }
    );
    await writeApprovalLog({
      module: moduleName, reference_id: document.id, user_id: userId,
      action: 'CONFIGURATION_REQUIRED', status: PENDING_CONFIGURATION, level: 0,
      client_id: clientId, workflow_id: null, comments: 'No tenant approval workflow configured'
    }, transaction);
    return { pending_configuration: true };
  }

  // (2) Provider-default AUTO_APPROVE resolution.
  if (isAutoApprove(res.rules)) {
    if (requireWorkflow) {
      // Strict mode: the auto-approve default does NOT satisfy "a real workflow is required".
      await document.update(
        { status: PENDING_CONFIGURATION, is_fully_approved: false, current_approval_level: 0, total_approval_levels: 0 },
        { transaction }
      );
      await writeApprovalLog({
        module: moduleName, reference_id: document.id, user_id: userId,
        action: 'CONFIGURATION_REQUIRED', status: PENDING_CONFIGURATION, level: 0,
        client_id: clientId, workflow_id: res.workflow.id,
        comments: 'Strict mode: tenant-specific approval workflow required (provider-default auto-approve not sufficient)'
      }, transaction);
      return { pending_configuration: true };
    }
    // Legacy behavior: auto-approve, but now explicit + attributed.
    await document.update(
      { status: 'APPROVED', is_fully_approved: true, workflow_id: res.workflow.id, current_approval_level: 0, total_approval_levels: 0 },
      { transaction }
    );
    await writeApprovalLog({
      module: moduleName, reference_id: document.id, user_id: userId,
      action: 'APPROVED', status: 'APPROVED', level: 0,
      client_id: clientId, workflow_id: res.workflow.id, comments: 'Auto-approved (provider-default)'
    }, transaction);
    return { auto_approved: true, workflow_id: res.workflow.id };
  }

  // (3) Real multi-level workflow.
  const totalLevels = res.rules.length;
  const firstLevel = res.rules[0];
  await document.update({
    status: 'IN_APPROVAL', workflow_id: res.workflow.id,
    current_level: firstLevel.level, current_approval_level: firstLevel.level,
    total_approval_levels: totalLevels, is_fully_approved: false
  }, { transaction });

  await writeApprovalLog({
    module: moduleName, reference_id: document.id, user_id: userId,
    action: 'SUBMITTED', status: 'SUBMITTED', level: 0, line_item_id: null,
    approval_topology: res.workflow.approval_topology || 'COLLECTIVE',
    progression_mode: res.workflow.progression_mode || 'COLLECTIVE',
    role_code: null, client_id: clientId, workflow_id: res.workflow.id,
    comments: `Submitted for ${totalLevels}-level approval`
  }, transaction);

  return { workflow_id: res.workflow.id, total_levels: totalLevels, current_level: firstLevel.level, required_role: firstLevel.role_code };
};

/**
 * D3 lock note: concurrency is serialized with SELECT ... FOR UPDATE (document.reload({lock:true}))
 * inside each approval transaction. The row lock is held until commit, and the reload re-reads the
 * COMMITTED status, so a racer that acquires the lock after a peer approved observes the new status
 * and is rejected by the APPROVABLE_STATUSES guard — no double-processing. (Replaces the prior
 * status_lock conditional-UPDATE, which released on commit and could let a late racer act on stale state.)
 */

/** Tenant-verify a resolved workflow (D5). Provider-default (client_id NULL) is shared. */
const workflowBelongsToTenant = (workflow, clientId) =>
  workflow.client_id === null || workflow.client_id === undefined || workflow.client_id === clientId;

/**
 * Process an approval action (APPROVE/REJECT). Tenant-aware + attributed + atomic.
 * @param {number|null} clientId REQUIRED — tenant id from getClientId(req)
 */
const processApproval = async (document, moduleName, action, user, comments, clientId) => {
  const transaction = await sequelize.transaction();
  if (!clientId) throw new Error('clientId is required for the approval engine (forgotten call-site?)');
  try {
    // D3 — atomic: lock the row AND re-read its committed status (serializes concurrent approvals)
    await document.reload({ transaction, lock: true });

    const APPROVABLE_STATUSES = ['IN_APPROVAL', 'SUBMITTED', 'PENDING_APPROVAL', 'DRAFT'];
    if (!APPROVABLE_STATUSES.includes(document.status)) {
      throw new Error(`Document is not pending approval (current status: ${document.status})`);
    }

    // No workflow attached — finalize directly (attributed).
    if (!document.workflow_id) {
      await document.update({
        status: action === 'REJECT' ? 'REJECTED' : 'APPROVED',
        is_fully_approved: action !== 'REJECT',
        approval_date: action !== 'REJECT' ? new Date() : null,
        status_lock: false
      }, { transaction });
      await writeApprovalLog({
        module: moduleName, reference_id: document.id, user_id: user.id,
        action: action === 'REJECT' ? 'REJECTED' : 'APPROVED',
        status: action === 'REJECT' ? 'REJECTED' : 'APPROVED', level: 0,
        client_id: clientId, workflow_id: null,
        comments: comments || (action === 'REJECT' ? 'Rejected' : 'Approved (no workflow configured)')
      }, transaction);
      await transaction.commit();
      return { status: action === 'REJECT' ? 'REJECTED' : 'APPROVED' };
    }

    const workflow = await ApprovalWorkflow.findByPk(document.workflow_id, {
      include: [{ model: ApprovalMatrix, as: 'matrix', attributes: MATRIX_ATTRS }], transaction
    });
    if (!workflow) throw new Error('Approval workflow not found');

    // D5 — tenant verification
    if (!workflowBelongsToTenant(workflow, clientId)) {
      recordTenantViolation({
        user_id: user.id, actor_client_id: clientId,
        target_model: 'ApprovalWorkflow', target_id: workflow.id, action: 'CROSS_TENANT_APPROVAL'
      });
      throw new Error('Access denied: approval workflow does not belong to your tenant');
    }

    const currentRule = workflow.matrix.find(m => m.level === (document.current_level || document.current_approval_level));
    if (!currentRule) throw new Error(`No rule found for level ${document.current_level}`);

    // D4 — RBAC: PROVIDER_ADMIN-only break-glass bypass, recorded.
    const userRoleName = (user.role || '').toUpperCase().trim();
    const requiredRoleCode = (currentRule.role_code || '').toUpperCase().trim();
    const requiredRoleName = (currentRule.role || '').toUpperCase().trim();
    const roleMatches = userRoleName === requiredRoleCode || userRoleName === requiredRoleName;
    const isProviderAdmin = userRoleName === 'PROVIDER_ADMIN';
    if (!roleMatches && !isProviderAdmin) {
      throw new Error(`Access denied. This level requires: ${currentRule.role || currentRule.role_code}`);
    }
    const bypassNote = (!roleMatches && isProviderAdmin) ? ` [PROVIDER_ADMIN break-glass bypass of level ${currentRule.level}]` : '';

    const approvalTopology = workflow.approval_topology || 'COLLECTIVE';
    const progressionMode = workflow.progression_mode || 'COLLECTIVE';

    if (action === 'REJECT') {
      await document.update({ status: 'REJECTED', is_fully_approved: false, status_lock: false }, { transaction });
      await writeApprovalLog({
        module: moduleName, reference_id: document.id, user_id: user.id,
        action: 'REJECTED', status: 'REJECTED', level: currentRule.level, line_item_id: null,
        approval_topology: approvalTopology, progression_mode: progressionMode, role_code: currentRule.role_code,
        client_id: clientId, workflow_id: workflow.id, comments: (comments || 'Rejected') + bypassNote
      }, transaction);
      await transaction.commit();
      return { status: 'REJECTED', level: currentRule.level };
    }

    // APPROVE
    await writeApprovalLog({
      module: moduleName, reference_id: document.id, user_id: user.id,
      action: 'APPROVED', status: 'APPROVED', level: currentRule.level, line_item_id: null,
      approval_topology: approvalTopology, progression_mode: progressionMode, role_code: currentRule.role_code,
      client_id: clientId, workflow_id: workflow.id, comments: (comments || 'Approved') + bypassNote
    }, transaction);

    const sortedMatrix = workflow.matrix.sort((a, b) => a.level - b.level);
    const nextRule = sortedMatrix[sortedMatrix.findIndex(m => m.level === currentRule.level) + 1];

    if (nextRule) {
      await document.update({ current_level: nextRule.level, current_approval_level: nextRule.level, status_lock: false }, { transaction });
      await transaction.commit();
      return { status: 'IN_APPROVAL', current_level: nextRule.level, next_required_role: nextRule.role_code,
        message: `Level ${currentRule.level} approved. Waiting for Level ${nextRule.level} (${nextRule.role})` };
    }
    await document.update({ status: 'APPROVED', is_fully_approved: true, approval_date: new Date(), status_lock: false }, { transaction });
    await transaction.commit();
    return { status: 'APPROVED', message: 'All approval levels completed. Document is fully approved.' };
  } catch (err) {
    await transaction.rollback();
    try { await document.update({ status_lock: false }); } catch (e) { /* best-effort unlock */ }
    throw err;
  }
};

const processLineApproval = async (document, moduleName, action, user, comments, lineItemId, clientId) => {
  const transaction = await sequelize.transaction();
  if (!clientId) throw new Error('clientId is required for the approval engine (forgotten call-site?)');
  try {
    if (!lineItemId) throw new Error('line_item_id is required for line-level approval');
    if (moduleName !== 'PR') throw new Error('Line-level approval currently supported for PR module');
    // D3 — atomic lock + fresh committed status (see processApproval)
    await document.reload({ transaction, lock: true });
    const LINE_APPROVABLE = ['IN_APPROVAL', 'SUBMITTED', 'PENDING_APPROVAL', 'DRAFT'];
    if (!LINE_APPROVABLE.includes(document.status)) {
      throw new Error(`Document is not pending approval (current status: ${document.status})`);
    }

    const workflow = await ApprovalWorkflow.findByPk(document.workflow_id, {
      include: [{ model: ApprovalMatrix, as: 'matrix', attributes: MATRIX_ATTRS }], transaction
    });
    if (!workflow) throw new Error('Approval workflow not found');
    if (!workflowBelongsToTenant(workflow, clientId)) {
      recordTenantViolation({ user_id: user.id, actor_client_id: clientId, target_model: 'ApprovalWorkflow', target_id: workflow.id, action: 'CROSS_TENANT_APPROVAL' });
      throw new Error('Access denied: approval workflow does not belong to your tenant');
    }
    if ((workflow.approval_topology || 'COLLECTIVE') !== 'LINE_LEVEL') {
      throw new Error('Workflow is not configured for line-level approval');
    }

    const currentLevel = document.current_level || document.current_approval_level;
    const currentRule = workflow.matrix.find(m => m.level === currentLevel);
    if (!currentRule) throw new Error(`No rule found for level ${currentLevel}`);

    const lineItem = await PurchaseRequisitionItem.findOne({ where: { id: lineItemId, requisition_id: document.id }, transaction });
    if (!lineItem) throw new Error('Line item not found for this document');

    if (action === 'REJECT') {
      await document.update({ status: 'REJECTED', is_fully_approved: false, status_lock: false }, { transaction });
      await writeApprovalLog({
        module: moduleName, reference_id: document.id, user_id: user.id, action: 'REJECTED', status: 'REJECTED',
        level: currentLevel, line_item_id: Number(lineItemId), approval_topology: 'LINE_LEVEL',
        progression_mode: workflow.progression_mode || 'PER_LINE', role_code: currentRule.role_code,
        client_id: clientId, workflow_id: workflow.id, comments: comments || 'Rejected on line-level'
      }, transaction);
      await transaction.commit();
      return { status: 'REJECTED', message: `Line ${lineItemId} rejected. Document rejected.` };
    }

    const existingLineApproval = await ApprovalLog.findOne({
      where: { module: moduleName, reference_id: document.id, level: currentLevel, line_item_id: Number(lineItemId), action: 'APPROVED' }, transaction
    });
    if (!existingLineApproval) {
      await writeApprovalLog({
        module: moduleName, reference_id: document.id, user_id: user.id, action: 'APPROVED', status: 'APPROVED',
        level: currentLevel, line_item_id: Number(lineItemId), approval_topology: 'LINE_LEVEL',
        progression_mode: workflow.progression_mode || 'PER_LINE', role_code: currentRule.role_code,
        client_id: clientId, workflow_id: workflow.id, comments: comments || 'Line approved'
      }, transaction);
    }

    const totalLines = await PurchaseRequisitionItem.count({ where: { requisition_id: document.id }, transaction });
    const approvedLines = await ApprovalLog.count({
      where: { module: moduleName, reference_id: document.id, level: currentLevel, action: 'APPROVED', line_item_id: { [Op.ne]: null } }, transaction
    });

    if (approvedLines < totalLines) {
      await document.update({ status_lock: false }, { transaction });
      await transaction.commit();
      return { status: 'IN_APPROVAL', current_level: currentLevel, message: `Line approved (${approvedLines}/${totalLines}) at level ${currentLevel}` };
    }

    const sortedMatrix = workflow.matrix.sort((a, b) => a.level - b.level);
    const nextRule = sortedMatrix[sortedMatrix.findIndex(m => m.level === currentLevel) + 1];
    if (nextRule) {
      await document.update({ current_level: nextRule.level, current_approval_level: nextRule.level, status_lock: false }, { transaction });
      await transaction.commit();
      return { status: 'IN_APPROVAL', current_level: nextRule.level, message: `All lines approved at level ${currentLevel}. Moved to level ${nextRule.level}.` };
    }
    await document.update({ status: 'APPROVED', is_fully_approved: true, approval_date: new Date(), status_lock: false }, { transaction });
    await transaction.commit();
    return { status: 'APPROVED', message: 'All lines approved across all levels. Document approved.' };
  } catch (err) {
    await transaction.rollback();
    try { await document.update({ status_lock: false }); } catch (e) { /* best-effort unlock */ }
    throw err;
  }
};

/** Approval status/pending-role info for a document. Log reads scoped by client_id (defense in depth). */
const getApprovalStatus = async (document, moduleName, clientId) => {
  if (!document.workflow_id) return { pending_role: null, levels: [] };
  const workflow = await ApprovalWorkflow.findByPk(document.workflow_id, {
    include: [{ model: ApprovalMatrix, as: 'matrix', attributes: MATRIX_ATTRS }]
  });
  if (!workflow) return { pending_role: null, levels: [] };

  const sortedMatrix = workflow.matrix.sort((a, b) => a.level - b.level);
  const currentRule = sortedMatrix.find(m => m.level === (document.current_level || document.current_approval_level));

  const logWhere = { module: moduleName, reference_id: document.id };
  if (clientId !== undefined && clientId !== null) {
    logWhere[Op.or] = [{ client_id: clientId }, { client_id: null }];
  }
  const logs = await ApprovalLog.findAll({ where: logWhere, order: [['timestamp', 'DESC']] });

  return {
    status: document.status,
    approval_topology: workflow.approval_topology || 'COLLECTIVE',
    progression_mode: workflow.progression_mode || 'COLLECTIVE',
    current_level: document.current_level || document.current_approval_level,
    total_levels: document.total_approval_levels,
    pending_role: currentRule?.role || currentRule?.role_code || null,
    pending_role_code: currentRule?.role_code || null,
    is_fully_approved: document.is_fully_approved,
    levels: sortedMatrix.map(m => ({ level: m.level, role: m.role, role_code: m.role_code,
      completed: logs.some(l => l.level === m.level && l.status === 'APPROVED') })),
    history: logs
  };
};

module.exports = { initiateApproval, processApproval, processLineApproval, getApprovalStatus, getApplicableRules, isAutoApprove };
