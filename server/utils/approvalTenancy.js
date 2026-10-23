'use strict';

/**
 * FT-003 / Batch 0 — Tenant-aware approval resolution (U3) + attributed log writer (U4).
 *
 * NEW and UNWIRED: nothing in the live approval engine calls these in Batch 0.
 * They are adopted by approvalEngine.js in Batch 2B.
 *
 * Policy (Amendment 3): NO silent auto-approve. When no workflow resolves for a
 * tenant (and no provider-default exists), the document is PENDING_CONFIGURATION.
 */

const PENDING_CONFIGURATION = 'PENDING_CONFIGURATION';

/**
 * U3 — Resolve the applicable workflow + rules for a tenant.
 * @param {string} moduleName  e.g. 'PR' | 'PO' | 'REQUEST'
 * @param {number} amount      document total
 * @param {number|null} clientId  REQUIRED. null = provider context (default workflow only).
 * @returns {Promise<{workflow, rules}|{pendingConfiguration:true, status:string}>}
 */
const getApplicableRulesForTenant = async (moduleName, amount, clientId, deps = {}) => {
  if (clientId === undefined) {
    throw new Error('getApplicableRulesForTenant: clientId is required (fail closed)');
  }
  const models = deps.models || require('../models');
  const Op = deps.Op || require('sequelize').Op;
  const { ApprovalWorkflow } = models;
  const ApprovalMatrix = models.ApprovalMatrix;
  const mod = String(moduleName).toUpperCase();

  const matrixInclude = {
    model: ApprovalMatrix,
    as: 'matrix',
    required: true,
    where: {
      is_active: true,
      min_amount: { [Op.lte]: amount },
      [Op.or]: [{ max_amount: null }, { max_amount: { [Op.gte]: amount } }]
    }
  };

  // 1. Tenant-specific workflow.
  let workflow = null;
  if (clientId != null) {
    workflow = await ApprovalWorkflow.findOne({
      where: { module: mod, status: 'ACTIVE', client_id: clientId },
      include: [matrixInclude]
    });
  }
  // 2. Provider-default workflow (client_id IS NULL).
  if (!workflow) {
    workflow = await ApprovalWorkflow.findOne({
      where: { module: mod, status: 'ACTIVE', client_id: null },
      include: [matrixInclude]
    });
  }
  // 3. None → PENDING_CONFIGURATION (never auto-approve).
  if (!workflow) return { pendingConfiguration: true, status: PENDING_CONFIGURATION };

  const rules = (workflow.matrix || []).slice().sort((a, b) => a.level - b.level);
  if (rules.length === 0) return { pendingConfiguration: true, status: PENDING_CONFIGURATION };
  return { workflow, rules };
};

/**
 * U4 — Attributed approval-log writer. Requires client_id; records workflow_id.
 */
const writeApprovalLog = async (fields = {}, transaction, deps = {}) => {
  if (fields.client_id === undefined || fields.client_id === null) {
    throw new Error('writeApprovalLog: client_id is required for tenant attribution');
  }
  const models = deps.models || require('../models');
  const payload = {
    module: fields.module,
    reference_id: fields.reference_id,
    user_id: fields.user_id,
    action: fields.action,
    status: fields.status,
    level: fields.level != null ? fields.level : 1,
    line_item_id: fields.line_item_id != null ? fields.line_item_id : null,
    approval_topology: fields.approval_topology,
    progression_mode: fields.progression_mode,
    role_code: fields.role_code,
    comments: fields.comments,
    client_id: fields.client_id,
    workflow_id: fields.workflow_id != null ? fields.workflow_id : null
  };
  return models.ApprovalLog.create(payload, transaction ? { transaction } : {});
};

module.exports = { getApplicableRulesForTenant, writeApprovalLog, PENDING_CONFIGURATION };
