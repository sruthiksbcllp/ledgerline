'use strict';
const { ApprovalWorkflow, ApprovalMatrix, ApprovalLog, PurchaseRequisition, PurchaseOrder, CapitalisationApproval, User } = require('../models');
const { buildWhere, getClientId, findOneTenanted, findOneViaParent } = require('../utils/tenantFilter');
const { recordTenantViolation } = require('../utils/securityEvents');
const { processApproval, processLineApproval, getApprovalStatus, getApplicableRules } = require('../services/approvalEngine');
const { Op } = require('sequelize');

// ─── MATRIX MANAGEMENT (Admin) ───────────────────────────────────────────────

exports.getMatrix = async (req, res) => {
  try {
    const { module } = req.query;
    const tw = buildWhere(req);
    const tenantClause = tw.client_id ? { [Op.or]: [{ client_id: tw.client_id }, { client_id: null }] } : {};
    const where = { status: 'ACTIVE', ...(module ? { module: module.toUpperCase() } : {}), ...tenantClause };

    const workflows = await ApprovalWorkflow.findAll({
      where,
      include: [{
        model: ApprovalMatrix,
        as: 'matrix',
        where: { is_active: true },
        required: false,
        order: [['level', 'ASC']]
      }]
    });

    res.json({ success: true, data: workflows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

exports.createMatrixRule = async (req, res) => {
  // FT-006: transactional + idempotent upsert so the new DB constraints
  // (uk_workflow_active_scope, uk_matrix_workflow_level_role, fk_matrix_workflow) are honored.
  // Defensive only -- no change to resolution / approval-engine semantics.
  const t = await ApprovalMatrix.sequelize.transaction();
  try {
    const { module_name, level, role, role_code, min_amount, max_amount, approval_topology, progression_mode, mode = 'COLLECTIVE', threshold_amount = 0 } = req.body;

    const ruleClientId = getClientId(req);
    // findOrCreate keeps the "one ACTIVE workflow per (module, client_id)" invariant
    // that FT-006 now enforces at the DB level.
    let [workflow] = await ApprovalWorkflow.findOrCreate({
      where: { module: module_name.toUpperCase(), status: 'ACTIVE', client_id: ruleClientId },
      defaults: {
        name: `${module_name} Workflow`,
        module: module_name.toUpperCase(),
        status: 'ACTIVE',
        client_id: ruleClientId,
        approval_topology: approval_topology || 'COLLECTIVE',
        progression_mode: progression_mode || 'COLLECTIVE'
      },
      transaction: t
    });

    if (approval_topology || progression_mode) {
      await workflow.update({
        approval_topology: approval_topology || workflow.approval_topology || 'COLLECTIVE',
        progression_mode: progression_mode || workflow.progression_mode || 'COLLECTIVE'
      }, { transaction: t });
    }

    const values = {
      workflow_id: workflow.id,
      client_id: workflow.client_id,
      module_name,
      level,
      role,
      role_code,
      min_amount: min_amount || 0,
      max_amount: max_amount || null,
      mode: String(mode || 'COLLECTIVE').toUpperCase(),
      threshold_amount: Number(threshold_amount || 0),
      is_mandatory: true,
      is_active: true
    };

    // Upsert by (workflow_id, level, role_code) -- matches uk_matrix_workflow_level_role.
    // NULL role_code rows are distinct in the unique index, so they always insert.
    let rule = null;
    if (role_code !== undefined && role_code !== null && role_code !== '') {
      rule = await ApprovalMatrix.findOne({
        where: { workflow_id: workflow.id, level, role_code },
        transaction: t
      });
    }
    if (rule) {
      await rule.update(values, { transaction: t });
    } else {
      rule = await ApprovalMatrix.create(values, { transaction: t });
    }

    await t.commit();
    res.json({ success: true, data: rule, message: 'Approval rule saved' });
  } catch (err) {
    await t.rollback();
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'An approval rule already exists for this workflow level and role.' });
    }
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

exports.updateMatrixRule = async (req, res) => {
  try {
    const rule = await findOneViaParent(ApprovalMatrix, req.params.id, req, { parent: ApprovalWorkflow });
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
    const payload = { ...req.body };
    if (payload.mode) payload.mode = String(payload.mode).toUpperCase();
    if (payload.threshold_amount !== undefined) payload.threshold_amount = Number(payload.threshold_amount || 0);
    await rule.update(payload);
    res.json({ success: true, data: rule, message: 'Rule updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

exports.deleteMatrixRule = async (req, res) => {
  try {
    const rule = await findOneViaParent(ApprovalMatrix, req.params.id, req, { parent: ApprovalWorkflow });
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
    await rule.update({ is_active: false });
    res.json({ success: true, message: 'Rule deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

exports.updateWorkflowConfig = async (req, res) => {
  try {
    const { module } = req.params;
    const { approval_topology, progression_mode } = req.body;
    const tw = buildWhere(req);
    const workflow = await ApprovalWorkflow.findOne({
      where: { module: module.toUpperCase(), status: 'ACTIVE', ...tw }
    });
    if (!workflow) {
      if (tw.client_id) {
        const probe = await ApprovalWorkflow.findOne({ where: { module: module.toUpperCase(), status: 'ACTIVE' }, attributes: ['id', 'client_id'] });
        if (probe && probe.client_id != null && probe.client_id !== tw.client_id) {
          recordTenantViolation({ user_id: req.user && req.user.id, actor_client_id: tw.client_id, target_model: 'ApprovalWorkflow', target_id: probe.id, request_path: req.originalUrl, ip_address: req.ip, actor_role: req.user && req.user.role });
        }
      }
      return res.status(404).json({ success: false, message: 'Active workflow not found for module' });
    }

    await workflow.update({
      approval_topology: approval_topology || workflow.approval_topology,
      progression_mode: progression_mode || workflow.progression_mode
    });

    return res.json({ success: true, data: workflow, message: 'Workflow configuration updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

// ─── APPROVAL ACTIONS ─────────────────────────────────────────────────────────

const getDocument = async (moduleName, documentId, req) => {
  const MODULE_MAP = {
    PR: PurchaseRequisition,
    PO: PurchaseOrder,
    CAPITALISATION: CapitalisationApproval,
  };
  const Model = MODULE_MAP[moduleName.toUpperCase()];
  if (!Model) throw new Error(`Unknown module: ${moduleName}`);
  const doc = await findOneTenanted(Model, documentId, req);
  return { doc, Model };
};

exports.approveDocument = async (req, res) => {
  try {
    const { module, id } = req.params;
    const { comments, line_item_id } = req.body;

    const { doc } = await getDocument(module, id, req);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    // Only look up workflow if workflow_id is set — null workflow_id handled inside processApproval (auto-approve)
    const clientId = doc.client_id != null ? doc.client_id : getClientId(req);
    const workflow = doc.workflow_id ? await ApprovalWorkflow.findByPk(doc.workflow_id) : null;
    const isLineLevel = workflow && workflow.approval_topology === 'LINE_LEVEL';
    const result = isLineLevel
      ? await processLineApproval(doc, module.toUpperCase(), 'APPROVE', req.user, comments, line_item_id, clientId)
      : await processApproval(doc, module.toUpperCase(), 'APPROVE', req.user, comments, clientId);

    // Post-approval status transition: PO APPROVED → ISSUED (for GRN compatibility)
    if (module.toUpperCase() === 'PO' && result.status === 'APPROVED') {
      // GUARD: never resurrect a CANCELLED/REJECTED PO (e.g. cancelled while an approval was in flight).
      // Atomic conditional update — only issue if the PO is still in an approvable state.
      const { Op } = require('sequelize');
      const [issued] = await PurchaseOrder.update(
        { status: 'ISSUED' },
        { where: { id: doc.id, status: { [Op.in]: ['IN_APPROVAL', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED'] } } }
      );
      if (issued) {
        result.status = 'ISSUED';
        result.message = 'Purchase Order approved and issued.';
      } else {
        result.status = doc.status;
        result.message = 'Approval recorded, but the PO is no longer in an approvable state (e.g. cancelled) and was not issued.';
      }
    }

    // CR-N07: capitalisation fully approved → release the frozen acquisition JV (verbatim, idempotent)
    if (module.toUpperCase() === 'CAPITALISATION' && result.status === 'APPROVED') {
      const { releaseCapitalisation } = require('../services/accountingEventService');
      await releaseCapitalisation(doc.id);
      result.message = 'Capitalisation approved; acquisition JV released.';
    }

    res.json({ success: true, data: result, message: result.message || 'Approved successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

exports.rejectDocument = async (req, res) => {
  try {
    const { module, id } = req.params;
    const { comments, line_item_id } = req.body;

    if (!comments || !String(comments).trim()) {
      return res.status(400).json({ success: false, message: 'A comment is required when rejecting a document' });
    }

    const { doc } = await getDocument(module, id, req);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    const clientId = doc.client_id != null ? doc.client_id : getClientId(req);
    const workflow = doc.workflow_id ? await ApprovalWorkflow.findByPk(doc.workflow_id) : null;
    const isLineLevel = workflow && workflow.approval_topology === 'LINE_LEVEL';
    const result = isLineLevel
      ? await processLineApproval(doc, module.toUpperCase(), 'REJECT', req.user, comments, line_item_id, clientId)
      : await processApproval(doc, module.toUpperCase(), 'REJECT', req.user, comments, clientId);

    res.json({ success: true, data: result, message: 'Document rejected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

exports.getApprovalHistory = async (req, res) => {
  try {
    const { module, id } = req.params;
    const { doc } = await getDocument(module, id, req);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    const status = await getApprovalStatus(doc, module.toUpperCase(), doc.client_id != null ? doc.client_id : getClientId(req));
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

// ─── MY PENDING APPROVALS (Dashboard) ────────────────────────────────────────

exports.getPendingApprovals = async (req, res) => {
  try {
    // Normalise role — stored as uppercase with underscores (e.g. PROVIDER_ADMIN)
    const userRole = (req.user.role || '').toUpperCase().trim();
    const PRIVILEGED = ['PROVIDER_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN', 'DEV_ADMIN'];
    const isPrivileged = PRIVILEGED.includes(userRole);

    // Tenant scoping
    const clientId = req.user.client_id;
    const tenantWhere = (userRole === 'PROVIDER_ADMIN' || userRole === 'DEV_ADMIN' || !clientId)
      ? {}
      : { client_id: clientId };

    // Non-privileged users: show items pending at their role's level
    if (!isPrivileged) {
      const myRules = await ApprovalMatrix.findAll({
        where: {
          [Op.and]: [
            { [Op.or]: [{ role_code: userRole }, { role: userRole }] },
            ...(clientId ? [{ [Op.or]: [{ client_id: clientId }, { client_id: null }] }] : [])
          ],
          is_active: true
        }
      });
      if (myRules.length === 0) {
        return res.json({ success: true, data: { PR: [], PO: [], total: 0 } });
      }
    }

    // Fetch pending PRs
    const prWhere = {
      ...tenantWhere,
      status: { [Op.in]: ['PENDING_APPROVAL', 'SUBMITTED', 'IN_APPROVAL', 'DRAFT'] }
    };
    const pendingPRs = await PurchaseRequisition.findAll({
      where: prWhere,
      include: [{ model: User, as: 'Requestor', attributes: ['first_name', 'last_name'], required: false }]
    });

    // Fetch pending POs
    const poWhere = {
      ...tenantWhere,
      status: { [Op.in]: ['IN_APPROVAL', 'SUBMITTED', 'PENDING_APPROVAL'] }
    };
    const pendingPOs = await PurchaseOrder.findAll({
      where: poWhere
    });

    // Fetch pending staff Requests (Requests module) — previously omitted, so submitted
    // requests never reached the approver queue. NOTE: the `requests` table has NO client_id
    // column; it is tenant-scoped through its Requestor (created_by -> User.client_id), so we
    // filter via that join (a plain client_id where threw "Unknown column" and returned nothing).
    const { Request, User: ReqUser } = require('../models');
    const pendingRequests = await Request.findAll({
      where: { is_fully_approved: false, status: { [Op.in]: ['IN_APPROVAL', 'SUBMITTED', 'PENDING_APPROVAL', 'PENDING_CONFIGURATION', 'PENDING'] } },
      include: clientId
        ? [{ model: ReqUser, as: 'Requestor', attributes: ['first_name', 'last_name'], where: { client_id: clientId }, required: true }]
        : [{ model: ReqUser, as: 'Requestor', attributes: ['first_name', 'last_name'], required: false }]
    }).catch(() => []);

    const rules = await ApprovalMatrix.findAll({ where: { is_active: true, ...(clientId ? { [Op.or]: [{ client_id: clientId }, { client_id: null }] } : {}) } });
    const buildLineBreakdown = async (moduleName, recId) => {
      const moduleRules = rules.filter((r) => String(r.module_name || '').toUpperCase() === moduleName);
      const lineMode = moduleRules.some((r) => String(r.mode || '').toUpperCase() === 'LINE');
      if (!lineMode || moduleName !== 'PR') return null;
      const totalLines = await require('../models').PurchaseRequisitionItem.count({ where: { requisition_id: recId } });
      const approvedLines = await ApprovalLog.count({
        where: {
          module: moduleName,
          reference_id: recId,
          action: 'APPROVED',
          line_item_id: { [Op.ne]: null }
        }
      });
      return { mode: 'LINE', total_lines: totalLines, approved_lines: approvedLines };
    };

    const enrichedPR = await Promise.all(
      pendingPRs.map(async (pr) => ({ ...pr.toJSON(), line_approval: await buildLineBreakdown('PR', pr.id) }))
    );
    const enrichedPO = await Promise.all(
      pendingPOs.map(async (po) => ({ ...po.toJSON(), line_approval: await buildLineBreakdown('PO', po.id) }))
    );

    res.json({
      success: true,
      data: {
        PR: enrichedPR,
        PO: enrichedPO,
        REQUEST: pendingRequests.map((r) => ({ ...r.toJSON(), module: 'REQUEST' })),
        total: pendingPRs.length + pendingPOs.length + pendingRequests.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

exports.getMyApprovalHistory = async (req, res) => {
  try {
    const logs = await ApprovalLog.findAll({
      where: { user_id: req.user.id },
      order: [['timestamp', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: logs });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
};
