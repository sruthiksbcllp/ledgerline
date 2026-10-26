const { PurchaseRequisition, PurchaseRequisitionItem, PurchaseOrder, PurchaseOrderItem, GRNItem, Budget, User, Vendor, GRN, Invoice, Property, CwipAsset, ApprovalWorkflow, ApprovalMatrix, ApprovalLog, Role, Item, Quotation, QuotationItem, Department, GateEntry, GateEntryItem, VendorDebitNote, Asset, AssetAmc, Entity, VendorAsset, Location, sequelize } = require('../models');

const { success, error } = require('../utils/responseHandler');
const { sendResponse } = require('../utils/response');
const AppError = require('../utils/appError');
const { checkBudget } = require('../utils/budget');
const safeExecute = require('../utils/safeExecutor');
const { buildWhere, buildAdminWhere, getClientId, findOneTenanted, findOneTenantedByClient } = require('../utils/tenantFilter');
const { recordTenantViolation } = require('../utils/securityEvents');
const { logActivity } = require('../utils/activityLogger');
const { Op } = require('sequelize');
const ImmutableAuditService = require('../services/ImmutableAuditService');
const { getNextNumber } = require('../services/documentNumbering');

// Resolve dynamic numbering codes for the entity + department dimensions (the client CR).
// entityCode = Entity.short_code; departmentCode = Department.numbering_code || dept_code. Fail-soft (null).
async function resolveNumCodes({ entity_id, department_id }, transaction) {
  let entityCode = null, departmentCode = null;
  try { if (entity_id) { const e = await Entity.findByPk(entity_id, { transaction }); entityCode = (e && e.short_code) ? e.short_code : null; } } catch (_) { /* ignore */ }
  try { if (department_id) { const d = await Department.findByPk(department_id, { transaction }); departmentCode = d ? (d.numbering_code || d.dept_code || null) : null; } } catch (_) { /* ignore */ }
  return { entityCode, departmentCode };
}
const { rankQuotations } = require('../utils/quotationRanking'); // CR-P02
const { canSeeRow } = require('../middleware/dataAccess.middleware'); // role-based row visibility
const { determineGstSplit } = require('../utils/gstPlaceOfSupply'); // CR-P03
const { writeApprovalLog } = require('../utils/approvalTenancy');



exports.createPR = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  const fail = async (message, statusCode = 400) => {
    if (transaction && !transaction.finished) await transaction.rollback();
    return error(res, message, statusCode);
  };

  try {
    const {
      department_id, property_id, cost_center, location_id, cost_center_id, required_date,
      vendor_suggestion, type, items, justification, item_description, status = 'SUBMITTED',
      entity_id, requested_by_user_id, requestor_name, asset_id, vendor_id
    } = req.body;

    // 1. Critical Field Validation
    if (!property_id || !department_id) {
      return fail('Property and Department are required', 400);
    }
    if (!items || !items.length) {
      return fail('At least one item is required', 400);
    }

    // 2. Foreign Key Verification and Tenant Derivation
    const [prop, dept] = await Promise.all([
      Property.findByPk(property_id),
      Department.findByPk(department_id || 0)
    ]);
    if (!prop || !dept) {
      return fail('Invalid selection: Property or Department not found', 400);
    }

    const propertyClientId = Number(prop.client_id || 0);
    const departmentClientId = Number(dept.client_id || 0);
    if (!propertyClientId || !departmentClientId || propertyClientId !== departmentClientId) {
      return fail('Property and Department must belong to the same tenant', 400);
    }

    let clientId = getClientId(req);
    if (clientId && Number(clientId) !== propertyClientId) {
      return fail('Selected Property/Department do not belong to your tenant', 403);
    }
    clientId = clientId || propertyClientId;
    if (!clientId) {
      return fail('Tenant context is required to create a purchase requisition', 400);
    }

    // 3. Process Items with Default Values
    let total_estimated_cost = 0;
    const validatedItems = (items || []).map(item => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.estimated_cost || 0);

      if (!item.item_name?.trim()) throw new AppError('Item name is required', 400);

      total_estimated_cost += (qty * price);
      return {
        ...item,
        quantity: qty,
        unit: item.unit || 'Nos',
        estimated_cost: price,
        item_id: item.item_id || null // Safe payload
      };
    });

    // 4. Auto-generate PR Number (atomic, tenant-scoped)
    let prLocationCode = null; // CR-P06: opt-in location numbering (engine ignores unless include_location)
    if (location_id) { try { const { Location } = require('../models'); const locRow = await Location.findByPk(location_id); prLocationCode = (locRow && locRow.location_code) ? locRow.location_code : null; } catch (e) { /* ignore */ } }
    const prCodes = await resolveNumCodes({ entity_id, department_id }, transaction);
    const pr_number = await getNextNumber(clientId, 'PR', transaction, { locationCode: prLocationCode, entityCode: prCodes.entityCode, departmentCode: prCodes.departmentCode });


    // 4.1 Duplicate Check (Idempotency - same dept, same amount, same user within 1 minute)
    const duplicate = await PurchaseRequisition.findOne({
      where: {
        client_id: clientId,
        department_id,
        total_cost: total_estimated_cost,
        requestor_id: req.user.id,
        createdAt: { [require('sequelize').Op.gt]: new Date(new Date() - 60000) }
      }
    });
    if (duplicate) throw new AppError('Duplicate PR detected. Please wait 1 minute before submitting similar requisition.', 400);

    const pr = await PurchaseRequisition.create({
      pr_number,
      property_id,
      department_id,
      cost_center,
      location_id: location_id || null,
      cost_center_id: cost_center_id || null,
      required_date,
      vendor_suggestion,
      justification,
      item_description,
      estimated_cost: total_estimated_cost,
      total_cost: total_estimated_cost,
      type: type || 'OPEX',
      requestor_id: req.user.id,
      client_id: clientId,
      status: ['DRAFT', 'SUBMITTED'].includes(status) ? status : 'SUBMITTED',
      entity_id: entity_id || null,
      requested_by_user_id: requested_by_user_id || null,
      requestor_name: requestor_name || null,
      asset_id: asset_id || null,
      vendor_id: vendor_id || null
    }, { transaction });

    await PurchaseRequisitionItem.bulkCreate(
      validatedItems.map(item => ({ ...item, requisition_id: pr.id, client_id: clientId })),
      { transaction }

    );

    // 4. Approval Workflow — unified engine (same as PO)
    const { initiateApproval } = require('../services/approvalEngine');
    const approvalResult = await initiateApproval(pr, 'PR', total_estimated_cost, req.user.id, transaction, clientId);

    // Map engine statuses to PR-specific statuses for backward compat
    // Engine sets APPROVED (auto), IN_APPROVAL (workflow found)
    // PR historically uses PENDING_APPROVAL instead of IN_APPROVAL
    if (!approvalResult.auto_approved && pr.status === 'IN_APPROVAL') {
      await pr.update({ status: 'PENDING_APPROVAL' }, { transaction });
    }

    await transaction.commit();
    logActivity({
      module: "PROCUREMENT",
      action: "CREATE_PR",
      user_id: req.user.id,
      client_id: req.user.client_id,
      metadata: { pr_id: pr.id, pr_number: pr.pr_number }
    }).catch(() => {});

    return success(res, pr, 'Purchase Requisition initiated successfully');

  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return error(res, err.message || "Something went wrong");
  }

};

exports.updatePR = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { property_id, department_id, items, justification, item_description, status } = req.body;


    // FIX: was findByPk — no tenant check allowed cross-tenant edits
    const client_id = req.user?.client_id;
    const pr = await PurchaseRequisition.findOne({
      where: { id, ...(client_id ? { client_id } : {}) }
    });
    if (!pr || !(await canSeeRow(req, 'PR', pr, { owner: 'requestor_id' }))) throw new AppError('PR not found', 404);

    const roleCode = (req.user?.role || '').toUpperCase();
    const isSuperAdmin = roleCode === 'SUPER_ADMIN' || roleCode === 'PROVIDER_ADMIN';

    if (!isSuperAdmin && !['DRAFT', 'PENDING_APPROVAL'].includes(pr.status)) {
      throw new AppError('Only DRAFT or PENDING requisitions can be edited.', 400);
    }

    // 1. Calculate Total Cost
    const total_cost = items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.estimated_cost)), 0);

    // 2. Update PR
    await pr.update({
      property_id,
      department_id,
      justification,
      item_description,
      total_cost,
      status: status || pr.status
    }, { transaction });

    // 3. Update Items (Sync logic: delete and recreate)
    await PurchaseRequisitionItem.destroy({ where: { requisition_id: id }, transaction });
    const prItems = items.map(item => ({
      requisition_id: id,
      item_id: item.item_id || null,
      item_name: item.item_name.trim(),
      quantity: item.quantity,
      estimated_cost: item.estimated_cost,
      unit: item.unit || 'unit',
      justification: item.justification
    }));
    await PurchaseRequisitionItem.bulkCreate(prItems, { transaction });

    // 4. Log Update
    await writeApprovalLog({
      module: 'PR', reference_id: id, user_id: req.user.id,
      action: 'UPDATED', status: 'SUBMITTED',
      client_id: pr.client_id, workflow_id: pr.workflow_id || null,
      comments: 'Requisition updated'
    }, transaction);

    await transaction.commit();
    sendResponse(res, 200, pr, 'Purchase Requisition updated successfully');
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return error(res, err.message || "Something went wrong");
  }
};

exports.approvePR = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { comments, line_item_id } = req.body;
    const pr = await findOneTenanted(PurchaseRequisition, req.params.id, req, {
      include: [{
        model: ApprovalWorkflow,
        as: 'Workflow',
        include: [{ model: ApprovalMatrix, as: 'matrix', attributes: ['id', 'workflow_id', 'module_name', 'level', 'role', 'role_code', 'min_amount', 'max_amount', 'is_mandatory', 'is_active'] }]
      }]
    });

    if (!pr) throw new AppError('PR not found', 404);

    // FIX: removed console.log('[APPROVAL DEBUG]') — was leaking PR number, status, username to console (security rule violation)

    if (pr.status === 'APPROVED') throw new AppError('PR is already approved', 400);
    if (Number(pr.requestor_id) === Number(req.user?.id)) {
      throw new AppError('You cannot approve your own requisition', 403);
    }
    const { approvalLimitFor } = require('../config/rbac');
    const approvalLimit = approvalLimitFor(req.user?.role);
    if (approvalLimit !== null && Number(pr.total_cost || 0) > approvalLimit) {
      throw new AppError(`This amount exceeds your approval limit of ${approvalLimit}. Escalate it to the next approver.`, 403);
    }

    const allowedStatuses = ['PENDING_APPROVAL', 'SUBMITTED'];
    if (!allowedStatuses.includes(pr.status)) {
      throw new AppError(`PR is in '${pr.status}' status and cannot be approved.`, 400);
    }

    try {
      const { checkBudget } = require('../utils/budget');
      await checkBudget(pr.property_id, pr.total_cost);
    } catch (e) {
      // Budget warning — non-blocking
    }

    // FIX: was req.user?.Role?.code (Sequelize association) — use req.user.role string
    const roleCode = (req.user?.role || '').toUpperCase();
    const isSuperAdmin = roleCode === 'SUPER_ADMIN' || roleCode === 'PROVIDER_ADMIN';

    // If workflow-driven approval exists, route through universal approval engine
    if (pr.workflow_id) {
      await transaction.rollback();
      const { processApproval, processLineApproval } = require('../services/approvalEngine');
      const workflow = await ApprovalWorkflow.findByPk(pr.workflow_id);
      const isLineLevel = workflow && workflow.approval_topology === 'LINE_LEVEL';
      const result = isLineLevel
        ? await processLineApproval(pr, 'PR', 'APPROVE', req.user, comments, line_item_id, pr.client_id)
        : await processApproval(pr, 'PR', 'APPROVE', req.user, comments, pr.client_id);
      return success(res, { pr, approval: result }, result.message || 'Requisition approved successfully');
    }

    // IF SUPER ADMIN -> Instant Final Approval (Bypass all logic)
    if (isSuperAdmin) {
      await pr.update({ status: 'APPROVED', approval_date: new Date() }, { transaction });
    } else {
      // Determine next level if workflow exists
      const matrix = pr.Workflow?.matrix || [];
      const matrixForAmount = matrix
        .filter(m => {
          const total = Number(pr.total_cost);
          return (total >= Number(m.min_amount)) && (!m.max_amount || total <= Number(m.max_amount));
        })
        .sort((a, b) => a.level - b.level);

      const currentIdx = matrixForAmount.findIndex(m => m.level === pr.current_level);
      const nextRule = matrixForAmount[currentIdx + 1];

      if (nextRule) {
        await pr.update({ current_level: nextRule.level }, { transaction });
      } else {
        await pr.update({ status: 'APPROVED', approval_date: new Date() }, { transaction });
      }
    }

    await writeApprovalLog({
      module: 'PR', reference_id: pr.id, user_id: req.user.id,
      action: 'APPROVED', status: 'APPROVED', level: pr.current_level,
      client_id: pr.client_id, workflow_id: pr.workflow_id || null,
      comments: comments || 'Approved'
    }, transaction);

    await transaction.commit();

    await safeExecute(async () => {
      const activityLogger = require('../services/activityLogger');
      await activityLogger.log({
        user_id: req.user.id,
        action: 'APPROVED',
        module: 'APPROVAL',
        record_id: pr.id,
        description: `PR ${pr.pr_number} approved at level ${pr.current_level}`
      });
    });

    ImmutableAuditService.log({
      clientId: req.user?.client_id,
      userId: req.user?.id,
      action: 'APPROVE_PR',
      module: 'PROCUREMENT',
      entityType: 'PR',
      entityId: pr.id,
      afterData: pr.toJSON(),
      req
    });
    return success(res, pr, 'Requisition approved successfully');

  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

exports.rejectPR = async (req, res, next) => {
  try {
    const { comments, line_item_id } = req.body;
    const clientId = getClientId(req);
    const prWhere = { id: req.params.id };
    if (clientId) prWhere.client_id = clientId;
    const pr = await PurchaseRequisition.findOne({ where: prWhere });
    if (!pr) throw new AppError('PR not found', 404);

    if (pr.workflow_id) {
      const { processApproval, processLineApproval } = require('../services/approvalEngine');
      const workflow = await ApprovalWorkflow.findByPk(pr.workflow_id);
      const isLineLevel = workflow && workflow.approval_topology === 'LINE_LEVEL';
      const result = isLineLevel
        ? await processLineApproval(pr, 'PR', 'REJECT', req.user, comments, line_item_id, pr.client_id)
        : await processApproval(pr, 'PR', 'REJECT', req.user, comments, pr.client_id);
      return success(res, { pr, approval: result }, result.message || 'Requisition rejected');
    }

    await pr.update({ status: 'REJECTED' });

    await writeApprovalLog({
      module: 'PR', reference_id: pr.id, user_id: req.user.id,
      action: 'REJECTED', status: 'REJECTED', level: pr.current_level,
      client_id: pr.client_id, workflow_id: pr.workflow_id || null,
      comments: comments || 'Rejected'
    });

    try {
      const activityLogger = require('../services/activityLogger');
      activityLogger.log({
        user_id: req.user.id,
        action: 'REJECTED',
        module: 'APPROVAL',
        record_id: pr.id,
        description: `PR ${pr.pr_number} rejected`
      });
    } catch (e) {
      // non-blocking activity log failure
    }

    return success(res, pr, 'Requisition rejected');
  } catch (err) {
    return error(res, err.message || "Something went wrong");
  }
};

exports.getPRApprovalHistory = async (req, res, next) => {
  try {
    // FIX: was no tenant filter — any user could view any PR's approval trail by guessing ID
    const client_id = req.user?.client_id;
    const pr = await PurchaseRequisition.findOne({
      where: { id: req.params.id, ...(client_id ? { client_id } : {}) },
      attributes: ['id', 'requestor_id']
    });
    if (!pr || !(await canSeeRow(req, 'PR', pr, { owner: 'requestor_id' }))) return error(res, 'PR not found', 404);

    const logs = await ApprovalLog.findAll({
      where: { module: 'PR', reference_id: req.params.id },
      include: [{ model: User, attributes: ['first_name', 'last_name', 'role_id'] }],
      order: [['timestamp', 'DESC']]
    });
    return success(res, logs);
  } catch (err) {
    return error(res, "Failed to load PR history");
  }
};

exports.getPRs = async (req, res) => {
  try {
    const where =
      req.user.role === "PROVIDER_ADMIN"
        ? {}
        : { client_id: req.user.client_id };

    const prs = await PurchaseRequisition.findAll({

      where: buildAdminWhere(req),
      include: [
        { model: PurchaseRequisitionItem, as: 'items' },
        { model: User, as: 'Requestor', attributes: ['first_name', 'last_name', 'username'] },
        { model: User, as: 'RequestedBy', attributes: ['first_name', 'last_name', 'username'], required: false },
        { model: Property, attributes: ['id', 'property_name'], where, required: false },
        { model: Location, attributes: ['id', 'location_name'], required: false },
        { model: Department, attributes: ['id', 'dept_name'], where, required: false },
        { model: Entity, as: 'Entity', attributes: ['id', 'entity_name'], required: false },
        { model: Asset, as: 'Asset', attributes: ['id', 'asset_name', 'asset_code'], required: false },
        { model: Vendor, as: 'Vendor', attributes: ['id', 'vendor_name'], required: false },
        { model: ApprovalWorkflow, as: 'Workflow', include: [{ model: ApprovalMatrix, as: 'matrix', attributes: ['id', 'workflow_id', 'module_name', 'level', 'role', 'role_code', 'min_amount', 'max_amount', 'is_mandatory', 'is_active'] }] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const enriched = await Promise.all(prs.map(async pr => {
      const items = pr.items || [];
      const items_count = items.length;

      const calculatedTotal = items.reduce((acc, i) => acc + (Number(i.quantity) * Number(i.estimated_cost)), 0);
      const total_cost = Number(pr.total_cost) > 0 ? Number(pr.total_cost) : calculatedTotal;

      const roleCode = (req.user?.role || '').toUpperCase();
      const roleName = roleCode.toLowerCase().replace(/_/g, ' ');
      const isSuperAdmin = roleCode === 'SUPER_ADMIN' || roleCode === 'PROVIDER_ADMIN';

      let can_approve = false;
      if (['PENDING_APPROVAL', 'SUBMITTED'].includes(pr.status)) {
        if (isSuperAdmin) {
          can_approve = true;
        } else if (pr.Workflow && Array.isArray(pr.Workflow.matrix)) {
          const currentRule = pr.Workflow.matrix.find(m => m.level === pr.current_level);
          if (currentRule && roleName === (currentRule.role || '').toLowerCase().trim()) {
            can_approve = true;
          }
        }
      }


      const history = await ApprovalLog.findAll({
        where: { module: 'PR', reference_id: pr.id },
        include: [{ model: User, attributes: ['first_name', 'last_name'] }],
        order: [['timestamp', 'DESC']]
      });

      return {
        ...pr.toJSON(),
        items_count,
        total_cost: Number(total_cost || 0),
        permissions: {
          can_edit: isSuperAdmin || ['DRAFT', 'PENDING_APPROVAL', 'SUBMITTED'].includes(pr.status),
          can_delete: isSuperAdmin || pr.status === 'DRAFT',
          can_approve
        },
        approval_history: history
      };
    }));

    const viewerRole = String(req.user?.role || '').toUpperCase();
    const visible = viewerRole === 'REQUESTER'
      ? enriched.filter((pr) => Number(pr.requestor_id) === Number(req.user?.id))
      : enriched;
    return success(res, visible);
  } catch (err) {
    return error(res, err.message || 'Failed to fetch purchase requisitions', 500);
  }
};

exports.getPRById = async (req, res, next) => {
  try {

    const pr = await findOneTenanted(PurchaseRequisition, req.params.id, req, {
      include: [
        { model: PurchaseRequisitionItem, as: 'items' },
        { model: User, as: 'Requestor', attributes: ['first_name', 'last_name', 'username'] },
        { model: Property, attributes: ['id', 'property_name'] },
        { model: Department, attributes: ['id', 'dept_name'] },
        { model: ApprovalWorkflow, as: 'Workflow', include: [{ model: ApprovalMatrix, as: 'matrix', attributes: ['id', 'workflow_id', 'module_name', 'level', 'role', 'role_code', 'min_amount', 'max_amount', 'is_mandatory', 'is_active'] }] }
      ]
    });

    if (!pr || !(await canSeeRow(req, 'PR', pr, { owner: 'requestor_id' }))) throw new AppError('PR not found', 404);

    const items = pr.items || [];
    let calculatedTotal = items.reduce((acc, i) => acc + (Number(i.quantity) * Number(i.estimated_cost)), 0);

    const roleCode = (req.user?.role || '').toUpperCase();
    const roleName = roleCode.toLowerCase().replace(/_/g, ' ');
    const isSuperAdmin = roleCode === 'SUPER_ADMIN';

    const result = {
      ...pr.toJSON(),
      items,
      items_count: items.length,
      total_cost: Number(pr.total_cost) > 0 ? Number(pr.total_cost) : calculatedTotal,
      permissions: {
        can_edit: isSuperAdmin || ['DRAFT', 'PENDING_APPROVAL', 'SUBMITTED'].includes(pr.status),
        can_delete: isSuperAdmin || pr.status === 'DRAFT'
      }
    };

    return success(res, result);
  } catch (err) {
    return error(res, "PR not found", 404);
  }
};

exports.deletePR = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;


    // FIX: was findByPk — no tenant check allowed cross-tenant deletes
    const client_id = req.user?.client_id;
    const pr = await PurchaseRequisition.findOne({
      where: { id, ...(client_id ? { client_id } : {}) }
    });
    if (!pr || !(await canSeeRow(req, 'PR', pr, { owner: 'requestor_id' }))) throw new AppError('PR not found', 404);

    // FIX: was req.user?.Role?.role_name — use req.user.role string directly
    const roleCode = (req.user?.role || '').toUpperCase();
    const isSuperAdmin = roleCode === 'SUPER_ADMIN' || roleCode === 'PROVIDER_ADMIN';

    // Block deletion if a PO is linked — FK constraint would fail anyway
    const linkedPO = await PurchaseOrder.findOne({ where: { pr_id: id } });
    if (linkedPO) {
      throw new AppError(`Cannot delete PR ${pr.pr_number} — a Purchase Order (${linkedPO.po_number || linkedPO.id}) is linked to it. Delete the PO first.`, 400);
    }

    // Only SUPER_ADMIN can delete non-DRAFT
    if (!isSuperAdmin && pr.status !== 'DRAFT') {
      throw new AppError('Only DRAFT requisitions can be deleted.', 400);
    }

    await PurchaseRequisitionItem.destroy({ where: { requisition_id: id }, transaction });
    await pr.destroy({ transaction });

    await transaction.commit();
    return success(res, null, 'Purchase Requisition deleted successfully');
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

// --- Purchase Order (PO) ---

exports.createPO = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      pr_id, quotation_id, source_type = 'PR',
      property_id, vendor_id, items: bodyItems, total_amount: bodyAmount, approval_comment,
      po_warranty, po_payment_terms, po_terms,
      manual_approvers
    } = req.body;

    const fail = async (message, code = 400) => {
      if (transaction && !transaction.finished) await transaction.rollback();
      return res.status(code).json({ success: false, message });
    };

    // 1. Critical Validation
    if (!property_id || !vendor_id) {
      return fail('Property and Vendor are required');
    }

    // 2. Foreign Key Check
    const [prop, vend] = await Promise.all([
      Property.findByPk(property_id),
      Vendor.findByPk(vendor_id)
    ]);
    if (!prop || !vend) {
      return fail('Invalid selection: Property or Vendor not found');
    }

    let finalItems = bodyItems || [];
    let finalTotal = Number(bodyAmount || 0); // Default 0
    let dept_id = null;
    let cost_cntr = null;
    let entity_id_val = null;         // Phase A - buying entity
    let cost_center_id_val = null;    // Phase A - cost-centre FK (CR-P05 parity)
    let location_id_val = null;       // location arc - from PR
    let requestor_name_val = null;    // requestor arc - from PR / Direct form
    let po_type_val = null;           // DOA-0 - Capex/Opex from PR
    let sourceClientId = null;
    let quotationClientId = null;
    let effectivePrId = source_type === 'PR' ? pr_id : null; // carry PR link even on quotation-sourced POs

    if (source_type === 'PR' && pr_id) {
      const pr = await PurchaseRequisition.findOne({ where: { id: pr_id, ...buildAdminWhere(req) },
        include: [{ model: PurchaseRequisitionItem, as: 'items' }]
      });
      if (!pr || pr.status !== 'APPROVED') {
        throw new AppError('PO can only be created from an APPROVED PR', 400);
      }
      if (!finalItems || !finalItems.length) {
        finalItems = (pr.items || []).map(item => ({
          item_id: item.item_id,
          item_name: item.item_name,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.estimated_cost || 0)
        }));
      }
      dept_id = pr.department_id;
      cost_cntr = pr.cost_center;
      entity_id_val = pr.entity_id || null;
      cost_center_id_val = pr.cost_center_id || null;
      location_id_val = pr.location_id || null;
      requestor_name_val = pr.requestor_name || null;
      po_type_val = pr.type || null;
      sourceClientId = pr.client_id;
      await pr.update({ status: 'PO_CREATED' }, { transaction });
    } else if (source_type === 'QUOTATION' && quotation_id) {
      const qtn = await Quotation.findOne({ where: { id: quotation_id, ...buildAdminWhere(req) },
        include: [{ model: QuotationItem, as: 'items' }, { model: PurchaseRequisition, as: 'PR' }]
      });
      if (!qtn || qtn.status !== 'APPROVED') {
        throw new AppError('PO can only be created from an APPROVED Quotation', 400);
      }
      if (!finalItems || !finalItems.length) {
        finalItems = (qtn.items || []).map(item => ({
          item_id: item.item_id,
          item_name: item.item_name,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0)
        }));
      }
      finalTotal = finalTotal || Number(qtn.net_amount || 0);
      dept_id = qtn.PR?.department_id;
      cost_cntr = qtn.PR?.cost_center;
      entity_id_val = qtn.PR?.entity_id || null;
      cost_center_id_val = qtn.PR?.cost_center_id || null;
      location_id_val = qtn.PR?.location_id || null;
      requestor_name_val = qtn.PR?.requestor_name || null;
      po_type_val = qtn.PR?.type || null;
      effectivePrId = qtn.pr_id || qtn.PR?.id || null; // capture the originating PR so the PO shows its PR number
      sourceClientId = qtn.PR?.client_id;
      quotationClientId = qtn.client_id;
      await qtn.update({ status: 'PO_CREATED' }, { transaction });
    } else if (source_type === 'DIRECT') {
      entity_id_val = req.body.entity_id || null;
      cost_center_id_val = req.body.cost_center_id || null;
      location_id_val = req.body.location_id || null;
      requestor_name_val = req.body.requestor_name || null;
      po_type_val = req.body.type || null;
      if (!finalItems || !finalItems.length) {
        // Auto-generate a placeholder item for Direct POs if none provided
        finalItems = [{
          item_name: 'Direct Purchase (Reference: Manual)',
          quantity: 1,
          unit_price: finalTotal
        }];
      }
    }

    if (!finalItems || !finalItems.length) {
      return fail('No items found to issue PO');
    }

    const calculatedTotal = finalItems.reduce((acc, i) => acc + (Number(i.quantity || 0) * Number(i.unit_price || 0)), 0);
    // PO grand total is derived from the line items when they carry prices; fall back to the
    // provided amount only when lines are unpriced (backward compatible).
    finalTotal = calculatedTotal > 0 ? calculatedTotal : Number(finalTotal || 0);

    const requestedClientId = getClientId(req);
    const tenantCandidates = [requestedClientId, sourceClientId, prop.client_id, vend.client_id, quotationClientId]
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    const clientId = tenantCandidates.find((candidate) =>
      (!prop.client_id || Number(prop.client_id) === candidate) &&
      (!vend.client_id || Number(vend.client_id) === candidate) &&
      (!sourceClientId || Number(sourceClientId) === candidate)
    ) || tenantCandidates[0];
    // Company users always raise POs in their own company; only provider admins may pick another.
    if (Object.keys(buildAdminWhere(req)).length && Number(clientId) !== Number(requestedClientId)) {
      return fail('Selected records do not belong to your company', 403);
    }
    if (!clientId) {
      return fail('Unable to determine tenant for Purchase Order. Select a valid property/source and try again.');
    }
    if (prop.client_id && Number(prop.client_id) !== Number(clientId)) {
      return fail('Selected property does not belong to the Purchase Order tenant');
    }
    if (vend.client_id && Number(vend.client_id) !== Number(clientId)) {
      return fail('Selected vendor does not belong to the Purchase Order tenant');
    }

    // GUARD: one active PO per PR. A PR should not have two live POs raised against it
    // (e.g. one from the PR + one from its awarded quotation). Block unless the earlier PO
    // has been cancelled/rejected. DIRECT POs (no PR) are unaffected.
    if (effectivePrId) {
      const existingPo = await PurchaseOrder.findOne({
        where: { pr_id: effectivePrId, status: { [Op.notIn]: ['CANCELLED', 'REJECTED'] } },
        transaction
      });
      if (existingPo) {
        throw new AppError(`This PR already has an active Purchase Order (${existingPo.po_number}). Cancel or reject it before raising another PO against the same PR.`, 400);
      }
    }

    const poCodes = await resolveNumCodes({ entity_id: entity_id_val, department_id: dept_id }, transaction);
    const po_number = req.body.po_number || await getNextNumber(clientId, 'PO', transaction, { entityCode: poCodes.entityCode, departmentCode: poCodes.departmentCode });



    const po = await PurchaseOrder.create({
      po_number,
      pr_id: effectivePrId,
      quotation_id: source_type === 'QUOTATION' ? quotation_id : null,
      source_type,
      source_id: pr_id || quotation_id || null,
      property_id,
      vendor_id,
      department_id: dept_id,
      cost_center: cost_cntr,
      cost_center_id: cost_center_id_val,
      entity_id: entity_id_val,
      location_id: location_id_val,
      requestor_name: requestor_name_val,
      type: po_type_val,
      total_amount: finalTotal,
      approval_comment: approval_comment || null,
      po_warranty: po_warranty || null,
      po_payment_terms: po_payment_terms || null,
      po_terms: po_terms || null,
      client_id: clientId,
      status: 'SUBMITTED'
    }, { transaction });

    const poItems = finalItems.map(item => ({
      po_id: po.id,
      client_id: clientId,
      item_id: item.item_id || null,
      item_name: item.item_name,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      total_price: Number(item.quantity || 0) * Number(item.unit_price || 0)
    }));

    await PurchaseOrderItem.bulkCreate(poItems, { transaction });

    // Wire PO into the universal approval engine (same as PR)
    const { initiateApproval } = require('../services/approvalEngine');
    po.doaManualApprovers = Array.isArray(manual_approvers) ? manual_approvers : [];  // Phase 3b: initiator-picked approvers for MANUAL levels
    const approvalResult = await initiateApproval(po, 'PO', finalTotal, req.user.id, transaction, clientId);

    // If auto-approved (no PO workflow configured), set status to ISSUED for backward compat
    if (approvalResult.auto_approved) {
      await po.update({ status: 'ISSUED' }, { transaction });
    }

    await transaction.commit();

    // DOA: send email-link approval requests to external approvers (post-commit, fail-open)
    if (approvalResult && approvalResult.doa) {
      require('../services/doaApproval.service').dispatchRequestEmails(approvalResult.request_id).catch(() => {});
    }

    await safeExecute(async () => {
      const { pushToQueue } = require('../services/integrationEngine');
      await pushToQueue('SAP', 'POST_PO', po.toJSON());
    });


    logActivity({
      module: "PROCUREMENT",
      action: "CREATE_PO",
      user_id: req.user.id,
      client_id: clientId,
      metadata: { po_id: po.id, po_number: po.po_number }
    }).catch(() => {});


    ImmutableAuditService.log({
      clientId,
      userId: req.user?.id,
      action: 'CREATE_PO',
      module: 'PROCUREMENT',
      entityType: 'PO',
      entityId: po.id,
      afterData: po.toJSON(),
      req
    });
    return success(res, po, 'Purchase Order issued successfully', 201);
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return error(res, err.message || "Something went wrong");
  }


};

exports.getPOs = async (req, res, next) => {
  try {
    const where =
      req.user.role === "PROVIDER_ADMIN"
        ? {}
        : { client_id: req.user.client_id };

    const pos = await PurchaseOrder.findAll({
      where: buildAdminWhere(req),
      include: [
        {
          model: PurchaseRequisition,
          include: [{ model: User, as: 'Requestor' }],
          where,
          required: false
        },
        { model: Property, attributes: ['id', 'property_name'], where, required: false },
        { model: Location, attributes: ['id', 'location_name'], required: false },
        { model: Vendor, where, required: false }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Add can_approve flag for PO approval workflow (same pattern as getPRs)
    const userRole = (req.user?.role || '').toUpperCase();
    const APPROVER_ROLES = ['PROVIDER_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'];
    const canApprove = APPROVER_ROLES.includes(userRole);
    const APPROVABLE_STATUSES = ['SUBMITTED', 'IN_APPROVAL', 'PENDING_APPROVAL'];
    const enriched = pos.map(po => {
      const plain = po.toJSON();
      plain.can_approve = canApprove && APPROVABLE_STATUSES.includes(plain.status);
      return plain;
    });
    if (userRole === 'VENDOR') {
      const owner = await User.findByPk(req.user.id, { attributes: ['vendor_id'] });
      const ownVendorId = Number(owner?.vendor_id || 0);
      return success(res, ownVendorId ? enriched.filter((po) => Number(po.vendor_id) === ownVendorId) : []);
    }
    return success(res, enriched);
  } catch (err) {
    return success(res, []);
  }
};

exports.getPOById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const clientId = getClientId(req);
    const poWhere = { id };
    if (clientId) poWhere.client_id = clientId;
    const po = await PurchaseOrder.findOne({
      where: poWhere,
      include: [
        { model: PurchaseOrderItem, as: 'items', required: false },
        { model: PurchaseRequisition, required: false,
          include: [{ model: User, as: 'Requestor', required: false }] },
        { model: Property, attributes: ['id', 'property_name'], required: false },
        { model: Location, attributes: ['id', 'location_name'], required: false },
        { model: Entity, as: 'Entity', attributes: ['id', 'entity_name'], required: false },
        { model: Vendor, required: false }
      ]
    });

    if (!po || !(await canSeeRow(req, 'PO', po, { vendor: 'vendor_id' }))) return error(res, 'Purchase Order not found', 404);
    return success(res, po);
  } catch (err) {
    next(err); // let global error handler log the real Sequelize error
  }
};

// --- GRN / Inwarding ---

// FIX: Removed duplicate simple createGRN implementation.
// The enterprise GRN controller (grn.controller.js) handles full 3-way match, QC, and serial tracking.
// POST /procurement/grn now delegates to the enterprise controller to prevent data inconsistency.
exports.createGRN = require('./grn.controller').createGRN;

// Add getInvoiceById — was missing, needed for invoice detail modal and resolve/mark-paid actions
exports.getInvoiceById = async (req, res, next) => {
  try {
    const client_id = req.user?.client_id;
    const invoice = await Invoice.findOne({
      where: { id: req.params.id, ...(client_id ? { client_id } : {}) },
      include: [
        { model: PurchaseOrder, attributes: ['id', 'po_number', 'vendor_id', 'total_amount'] },
        { model: GRN, attributes: ['id', 'grn_number', 'status'] },
        { model: sequelize.models.ServiceEntrySheet, attributes: ['id', 'ses_number', 'status', 'total_value'], required: false }
      ]
    });
    if (!invoice || !(await canSeeRow(req, 'INVOICE', invoice, { vendor: 'vendor_id' }))) throw new AppError('Invoice not found', 404);
    return success(res, invoice);
  } catch (err) {
    next(err);
  }
};

// Add updatePO — amend vendor, remarks, or status of an issued PO
exports.updatePO = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const client_id = req.user?.client_id;
    const po = await PurchaseOrder.findOne({
      where: { id, ...(client_id ? { client_id } : {}) }
    });
    if (!po) throw new AppError('PO not found', 404);

    const roleCode = (req.user?.role || '').toUpperCase();
    const isSuperAdmin = roleCode === 'SUPER_ADMIN' || roleCode === 'PROVIDER_ADMIN';

    if (!isSuperAdmin && ['RECEIVED', 'CANCELLED'].includes(po.status)) {
      throw new AppError('Cannot amend a fully received or cancelled PO', 400);
    }

    const { vendor_id, remarks, expected_delivery_date, po_warranty, po_payment_terms, po_terms } = req.body;
    const upd = { vendor_id, remarks, expected_delivery_date };
    if (po_warranty !== undefined) upd.po_warranty = po_warranty;
    if (po_payment_terms !== undefined) upd.po_payment_terms = po_payment_terms;
    if (po_terms !== undefined) upd.po_terms = po_terms;
    await po.update(upd, { transaction });

    await writeApprovalLog({
      module: 'PO', reference_id: po.id, user_id: req.user.id,
      action: 'UPDATED', status: 'SUBMITTED',
      client_id: po.client_id, workflow_id: po.workflow_id || null,
      comments: remarks || 'PO amended'
    }, transaction);

    await transaction.commit();
    return success(res, po, 'Purchase Order updated successfully');
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(err);
  }
};

// Add cancelPO — cancel/void an issued PO that hasn't been received
exports.cancelPO = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const client_id = req.user?.client_id;
    const po = await PurchaseOrder.findOne({
      where: { id, ...(client_id ? { client_id } : {}) }
    });
    if (!po) throw new AppError('PO not found', 404);
    if (['RECEIVED', 'CANCELLED'].includes(po.status)) {
      throw new AppError(`Cannot cancel a PO with status ${po.status}`, 400);
    }

    await po.update({ status: 'CANCELLED' }, { transaction });

    // Revert PR status back to APPROVED so it can be re-quoted
    if (po.pr_id) {
      await PurchaseRequisition.update(
        { status: 'APPROVED' },
        { where: { id: po.pr_id }, transaction }
      );
    }

    await writeApprovalLog({
      module: 'PO', reference_id: po.id, user_id: req.user.id,
      action: 'CANCELLED', status: 'SUBMITTED',
      client_id: po.client_id, workflow_id: po.workflow_id || null,
      comments: (req.body && req.body.reason) || 'PO cancelled' // guard: DELETE may carry no body (req.body undefined)
    }, transaction);

    await transaction.commit();
    return success(res, po, 'Purchase Order cancelled successfully');
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(err);
  }
};

exports.getGRNs = async (req, res, next) => {
  try {
    const grns = await GRN.findAll({
      where: buildAdminWhere(req),
      include: [
        { model: PurchaseOrder, attributes: ['id', 'po_number', 'property_id'] },
        { model: Property, attributes: ['id', 'property_name'] },
        { model: Location, attributes: ['id', 'location_name'], required: false },
        { model: Invoice, attributes: ['id', 'invoice_number', 'status', 'matching_status'], required: false }
      ],
      order: [['createdAt', 'DESC']]
    });
    return success(res, grns);
  } catch (err) {
    return success(res, []);
  }
};

const resolveQualityBucket = ({ accepted, rejected, damaged }) => {
  const nonZero = [
    accepted > 0 ? 'ACCEPTED' : null,
    rejected > 0 ? 'REJECTED' : null,
    damaged > 0 ? 'DAMAGED' : null
  ].filter(Boolean);
  return nonZero.length > 1 ? 'MIXED' : (nonZero[0] || 'ACCEPTED');
};

const createVendorDebitNoteDraft = async ({ po, grn, gateEntry, rows, clientId, transaction }) => {
  const impactedRows = rows.filter((row) => Number(row.rejected_quantity || 0) > 0 || Number(row.damaged_quantity || 0) > 0);
  if (!impactedRows.length) return null;

  const debitBase = impactedRows.reduce((sum, row) => {
    const badQty = Number(row.rejected_quantity || 0) + Number(row.damaged_quantity || 0);
    return sum + badQty * Number(row.unit_price || 0);
  }, 0);
  if (debitBase <= 0) return null;

  const count = await VendorDebitNote.count({ transaction });
  const debit_note_number = `VDN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  const hasDamaged = impactedRows.some((row) => Number(row.damaged_quantity || 0) > 0);
  const hasRejected = impactedRows.some((row) => Number(row.rejected_quantity || 0) > 0);

  return VendorDebitNote.create({
    debit_note_number,
    client_id: clientId,
    vendor_id: po.vendor_id,
    po_id: po.id,
    grn_id: grn?.id || null,
    gate_entry_id: gateEntry?.id || null,
    reason: 'Quality exception: rejected/damaged quantity at gate entry or GRN',
    bucket: hasDamaged && !hasRejected ? 'DAMAGED' : hasRejected && !hasDamaged ? 'REJECTED' : 'QUALITY',
    amount: debitBase,
    tax_amount: 0,
    total_amount: debitBase,
    status: 'DRAFT',
    details_json: impactedRows.map((row) => ({
      po_item_id: row.po_item_id,
      item_name: row.item_name,
      rejected_quantity: row.rejected_quantity,
      damaged_quantity: row.damaged_quantity,
      unit_price: row.unit_price
    }))
  }, { transaction });
};

exports.getGateEntries = async (req, res) => {
  try {
    const entries = await GateEntry.findAll({
      where: buildAdminWhere(req),
      include: [
        { model: GateEntryItem, as: 'items' },
        { model: PurchaseOrder, attributes: ['id', 'po_number'] },
        { model: Vendor, attributes: ['id', 'vendor_name'] },
        { model: GRN, attributes: ['id', 'grn_number'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    return success(res, entries);
  } catch (err) {
    return error(res, err.message || 'Failed to load gate entries');
  }
};

exports.deleteGateEntry = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const clientId = getClientId(req);
    const where = { id: req.params.id };
    if (clientId) where.client_id = clientId;
    const entry = await GateEntry.findOne({ where, transaction });
    if (!entry) { await transaction.rollback(); return error(res, 'Gate entry not found', 404); }
    // Guard: once a gate entry has generated a GRN it is a posted receiving record
    // (GRN + auto-created assets depend on it) — do not allow deletion.
    if (entry.grn_id || entry.status === 'GRN_CREATED') {
      await transaction.rollback();
      return error(res, 'This gate entry already generated a GRN and cannot be deleted. Reverse the GRN first.', 400);
    }
    await GateEntryItem.destroy({ where: { gate_entry_id: entry.id }, transaction });
    await entry.destroy({ transaction });
    await transaction.commit();
    return success(res, { id: entry.id }, 'Gate entry deleted');
  } catch (err) {
    await transaction.rollback();
    return error(res, err.message || 'Failed to delete gate entry');
  }
};

exports.getVendorDebitNotes = async (req, res) => {
  try {
    const notes = await VendorDebitNote.findAll({
      where: buildAdminWhere(req),
      include: [
        { model: Vendor, attributes: ['id', 'vendor_name'] },
        { model: PurchaseOrder, attributes: ['id', 'po_number'] },
        { model: GRN, attributes: ['id', 'grn_number'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    return success(res, notes);
  } catch (err) {
    return error(res, err.message || 'Failed to load debit notes');
  }
};

exports.createGateEntry = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { po_id, property_id, items = [], vehicle_number, challan_number, remarks, create_grn = true } = req.body;
    if (!po_id || !property_id) throw new AppError('PO and property are required', 400);
    if (!items.length) throw new AppError('At least one gate entry item is required', 400);

    const po = await PurchaseOrder.findByPk(po_id, {
      include: [{ model: PurchaseOrderItem, as: 'items' }],
      transaction
    });
    if (!po) throw new AppError('PO not found', 404);

    const requestedClientId = getClientId(req);
    const clientId = requestedClientId || po.client_id;
    if (!clientId) throw new AppError('Unable to determine tenant for gate entry', 400);
    if (Number(po.client_id) !== Number(clientId)) {
      throw new AppError('Selected PO does not belong to the gate entry tenant', 400);
    }
    if (Number(po.property_id) !== Number(property_id)) {
      throw new AppError('Selected property does not match the PO property', 400);
    }
    const gateCount = await GateEntry.count({ where: { client_id: clientId }, transaction });
    const gate_entry_number = `GE-C${clientId}-${new Date().getFullYear()}-${String(gateCount + 1).padStart(4, '0')}`;

    const gateEntry = await GateEntry.create({
      gate_entry_number,
      po_id,
      property_id,
      vendor_id: po.vendor_id,
      received_by: req.user.id,
      received_date: new Date(),
      vehicle_number,
      challan_number,
      remarks,
      client_id: clientId
    }, { transaction });

    const qualityRows = [];
    for (const item of items) {
      const poItem = await findOneTenantedByClient(PurchaseOrderItem, item.po_item_id, clientId, { transaction });
      if (!poItem) throw new AppError(`PO Item ${item.po_item_id} not found`, 400);

      const accepted = Number(item.accepted_quantity ?? item.received_quantity ?? 0);
      const rejected = Number(item.rejected_quantity || 0);
      const damaged = Number(item.damaged_quantity || 0);
      const received = Number(item.received_quantity ?? (accepted + rejected + damaged));
      if (received !== accepted + rejected + damaged) {
        throw new AppError(`Accepted + rejected + damaged must equal received quantity for ${poItem.item_name}`, 400);
      }
      const remaining = Number(poItem.quantity) - Number(poItem.received_quantity);
      if (received > remaining) {
        throw new AppError(`Gate quantity for ${poItem.item_name} exceeds PO remaining quantity (${remaining})`, 400);
      }

      const quality_bucket = resolveQualityBucket({ accepted, rejected, damaged });
      const qc_status = rejected || damaged ? (accepted > 0 ? 'PARTIAL' : 'FAIL') : 'PASS';
      const row = {
        client_id: clientId,
        gate_entry_id: gateEntry.id,
        po_item_id: poItem.id,
        item_id: poItem.item_id,
        item_name: poItem.item_name,
        ordered_quantity: poItem.quantity,
        received_quantity: received,
        accepted_quantity: accepted,
        rejected_quantity: rejected,
        damaged_quantity: damaged,
        quality_bucket,
        qc_status,
        qc_remarks: item.qc_remarks || item.remarks || null,
        unit_price: Number(poItem.unit_price || 0)
      };
      qualityRows.push(row);
      await GateEntryItem.create(row, { transaction });
    }

    const totals = qualityRows.reduce((acc, row) => {
      acc.received += Number(row.received_quantity || 0);
      acc.accepted += Number(row.accepted_quantity || 0);
      acc.rejected += Number(row.rejected_quantity || 0);
      acc.damaged += Number(row.damaged_quantity || 0);
      return acc;
    }, { received: 0, accepted: 0, rejected: 0, damaged: 0 });

    const qc_status = totals.rejected || totals.damaged
      ? (totals.accepted > 0 ? 'PARTIAL' : 'FAILED')
      : 'PASSED';
    await gateEntry.update({ qc_status, status: 'QC_COMPLETED' }, { transaction });

    let grn = null;
    if (create_grn && totals.accepted > 0) {
      const grn_number = await getNextNumber(clientId, 'GRN', transaction);
      grn = await GRN.create({
        grn_number,
        po_id,
        gate_entry_id: gateEntry.id,
        property_id,
        location_id: po.location_id || null,
        vendor_id: po.vendor_id,
        received_by: req.user.id,
        received_date: new Date(),
        status: totals.accepted < totals.received ? 'PARTIAL' : 'RECEIVED',
        client_id: clientId,
        remarks: remarks || `Generated from gate entry ${gate_entry_number}`
      }, { transaction });

      for (const row of qualityRows) {
        if (Number(row.accepted_quantity || 0) <= 0) continue;
        await GRNItem.create({
          grn_id: grn.id,
          po_item_id: row.po_item_id,
          item_id: row.item_id,
          item_name: row.item_name,
          ordered_quantity: row.ordered_quantity,
          received_quantity: row.accepted_quantity,
          accepted_quantity: row.accepted_quantity,
          rejected_quantity: row.rejected_quantity,
          damaged_quantity: row.damaged_quantity,
          quality_bucket: row.quality_bucket,
          qc_status: Number(row.accepted_quantity || 0) > 0 ? 'PASS' : 'FAIL',
          qc_remarks: row.qc_remarks,
          client_id: clientId,
          remarks: row.qc_remarks
        }, { transaction });
        const poItem = await findOneTenantedByClient(PurchaseOrderItem, row.po_item_id, clientId, { transaction });
        if (!poItem) throw new AppError(`PO Item ${row.po_item_id} not found`, 400);
        await poItem.increment('received_quantity', { by: row.accepted_quantity, transaction });
      }

      // Gate-entry-generated GRN must create fixed assets too (shared with the direct GRN path).
      const { createAssetsForGrn } = require('../services/grnAssets');
      await createAssetsForGrn({
        po, grn,
        acceptedLines: qualityRows.map(r => ({ item_id: r.item_id, item_name: r.item_name, unit_price: r.unit_price, accepted_quantity: r.accepted_quantity })),
        location_id: po.location_id || null,
        invoice_number: null,
        clientId,
        userId: req.user.id
      }, transaction);

      await gateEntry.update({ grn_id: grn.id, status: 'GRN_CREATED' }, { transaction });
    }

    const debitNote = await createVendorDebitNoteDraft({ po, grn, gateEntry, rows: qualityRows, clientId, transaction });

    const allPoItems = await PurchaseOrderItem.findAll({ where: { po_id: po.id }, transaction });
    const isFullyReceived = allPoItems.every(i => Number(i.received_quantity) >= Number(i.quantity));
    await po.update({ status: isFullyReceived ? 'RECEIVED' : 'PARTIAL_RECEIVED' }, { transaction });

    await transaction.commit();

    // Update Capex actual_spend if PO is linked to a Capex request
    if (grn) {
      try {
        const { CapexRequestPlan, CapexBudgetPlan } = require('../models');
        const capexReq = await CapexRequestPlan.findOne({ where: { linked_po_id: po_id, client_id: clientId } });
        if (capexReq) {
          await capexReq.update({ status: 'PROCURED', linked_grn_id: grn.id });
          const budget = await CapexBudgetPlan.findOne({
            where: { client_id: clientId, department_id: capexReq.department_id, category_id: capexReq.category_id }
          });
          if (budget) {
            await budget.update({ actual_spend: Number(budget.actual_spend || 0) + Number(capexReq.amount || 0) });
          }
        }
      } catch (e) { /* Capex sync non-blocking */ }
    }

    logActivity({
      module: 'PROCUREMENT',
      action: 'CREATE_GATE_ENTRY',
      user_id: req.user.id,
      client_id: clientId,
      metadata: { gate_entry_id: gateEntry.id, gate_entry_number, grn_id: grn?.id || null, debit_note_id: debitNote?.id || null, totals }
    }).catch(() => {});

    return success(res, { gateEntry, grn, debitNote, totals }, 'Gate entry QC completed');
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return error(res, err.message || 'Something went wrong');
  }
};

// --- Invoices & Finance ---

// Canonical mapping: ThreeWayMatchService result -> invoice status fields (single source of truth,
// so the invoice's matching_status/payment block always agrees with the 3-Way Match page).
/**
 * A service invoice can only be linked to an approved SES of the same PO and company, and each
 * SES is invoiced once (a rejected invoice frees it again). `exceptInvoiceId` skips the invoice
 * being edited.
 */
async function assertSesInvoiceable(sesId, { clientId, poId, exceptInvoiceId } = {}) {
  const { ServiceEntrySheet } = require('../models');
  const ses = await ServiceEntrySheet.findByPk(sesId);
  if (!ses || (clientId && Number(ses.client_id) !== Number(clientId))) throw new AppError('Service entry sheet not found', 404);
  if (poId && Number(ses.po_id) !== Number(poId)) throw new AppError(`Service entry sheet ${ses.ses_number} belongs to a different PO`, 400);
  if (ses.status !== 'APPROVED') throw new AppError(`Service entry sheet ${ses.ses_number} is not approved yet, so it cannot be invoiced`, 400);
  const other = await Invoice.findOne({
    where: {
      ses_id: ses.id,
      status: { [Op.ne]: 'REJECTED' },
      ...(exceptInvoiceId ? { id: { [Op.ne]: exceptInvoiceId } } : {})
    }
  });
  if (other) throw new AppError(`Service entry sheet ${ses.ses_number} is already invoiced on ${other.invoice_number}`, 400);
  return ses;
}

function matchToInvoiceFields(match) {
  const matched = match && match.status === 'MATCHED';
  return {
    matching_status: matched ? 'MATCHED' : 'MISMATCHED',
    status: matched ? 'UNPAID' : 'EXCEPTION',
    payment_blocked: !matched,
    payment_block_reason: matched ? null : ((match && match.blocked_reason) || '3-way match variance'),
    exception_status: matched ? 'NONE' : 'OPEN',
    matching_exception_details: matched ? null : ((match && match.blocked_reason) || null)
  };
}

exports.createInvoice = async (req, res, next) => {
  try {
    const { invoice, match } = await recordInvoice(req.body, req);
    return success(res, invoice, match.matched ? 'Invoice processed and 3-Way Match verified' : 'Invoice logged with Match Exception and payment blocked');
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message || "Something went wrong" });
  }
};

/**
 * Creates an invoice in Invoice Processing (duplicate block, 3-way match, GST/TDS, CWIP,
 * Tally sync, audit). Shared by the Invoice Processing form and GRN creation.
 * `body` holds the invoice fields; `req` supplies the acting user and tenant.
 */
async function recordInvoice(body, req) {
  {
    const {
      po_id, grn_id, ses_id,
      invoice_number, base_amount, gst_amount, property_id,
      hsn_sac_code, is_itc_eligible
    } = body;
    const requestedClientId = getClientId(req);

    if (!po_id) throw new AppError('PO is required', 400);
    if (!invoice_number) throw new AppError('Invoice number is required', 400);
    if (grn_id && ses_id) throw new AppError('Link the invoice to a GRN (goods) or a service entry sheet (services), not both', 400);

    const baseAmount = Number(base_amount || 0);
    const gstAmountInput = Number(gst_amount || 0);
    const total_amount = baseAmount + gstAmountInput;

    // Fetch PO first to derive vendor_id and property_id
    const po = await PurchaseOrder.findByPk(po_id, { include: [{ model: PurchaseRequisition }] });
    if (!po) throw new AppError('Purchase Order not found', 404);

    // FT-002 Batch 1b: derive tenant and enforce PO ownership (PA-preserving)
    const clientId = requestedClientId || po.client_id;
    if (!clientId) throw new AppError('Unable to determine tenant for invoice', 400);
    if (po.client_id && Number(po.client_id) !== Number(clientId)) {
      recordTenantViolation({ user_id: req.user && req.user.id, actor_client_id: requestedClientId, target_model: 'PurchaseOrder', target_id: po.id, request_path: req.originalUrl, ip_address: req.ip, actor_role: req.user && req.user.role });
      throw new AppError('Selected PO does not belong to your tenant', 403);
    }

    const vendor_id = body.vendor_id || po.vendor_id;
    const resolvedPropertyId = property_id || po.property_id;

    // 1. Strict Rule: Duplicate Invoice Block (only by invoice_number)
    const existingInvoice = await Invoice.findOne({
      where: { invoice_number, client_id: clientId }
    });
    if (existingInvoice) {
      throw new AppError('Invoice number already exists', 400);
    }

    // Fetch GRN and vendor (grn_id is optional)
    const [grn, vendor] = await Promise.all([
      grn_id ? GRN.findByPk(grn_id) : Promise.resolve(null),
      Vendor.findByPk(vendor_id)
    ]);
    if (!vendor) throw new AppError('Vendor not found for this PO', 400);

    // FT-002 Batch 1b: enforce GRN (emit) + vendor (silent) tenant ownership
    if (grn && grn.client_id && Number(grn.client_id) !== Number(clientId)) {
      recordTenantViolation({ user_id: req.user && req.user.id, actor_client_id: requestedClientId, target_model: 'GRN', target_id: grn.id, request_path: req.originalUrl, ip_address: req.ip, actor_role: req.user && req.user.role });
      throw new AppError('Selected GRN does not belong to your tenant', 403);
    }
    if (vendor.client_id && Number(vendor.client_id) !== Number(clientId)) {
      throw new AppError('Selected vendor does not belong to your tenant', 403);
    }
    if (ses_id) await assertSesInvoiceable(ses_id, { clientId, poId: po_id });

    // 2. 3-Way Match Validation (when a GRN or an approved service entry sheet is provided)
    const { validate3WayMatch, validateSesMatch } = require('../utils/finance');
    const tolerancePercent = Number(body.tolerance_percent ?? process.env.THREE_WAY_AMOUNT_TOLERANCE_PCT ?? 5);
    const match = grn_id
      ? await validate3WayMatch(po_id, grn_id, total_amount, {
          amountPercent: tolerancePercent,
          unitPricePercent: Number(process.env.THREE_WAY_UNIT_PRICE_TOLERANCE_PCT || 5),
          quantityPercent: Number(process.env.THREE_WAY_QTY_TOLERANCE_PCT || 0)
        })
      : ses_id
        ? await validateSesMatch(po_id, ses_id, baseAmount, { amountPercent: tolerancePercent })
        : { matched: true, error: null };

    // 3. GST/TDS Compliance Engine (CR-P03: property-level place of supply, flag-gated)
    const orgStateCode = String(process.env.ORG_GST_STATE_CODE || '').trim();
    const vendorStateCode = String(vendor.gst_registered_state_code || vendor.gst_number || '').slice(0, 2);
    let supplyStateCode = orgStateCode;
    let buyerGstin = null; // Phase D - place-of-supply GSTIN snapshot
    try {
      const { FeatureToggle } = require('../models');
      const tog = await FeatureToggle.findOne({ where: { feature_key: 'GST_PLACE_OF_SUPPLY' } });
      if (tog && tog.is_enabled && resolvedPropertyId) {
        const prop = await Property.findByPk(resolvedPropertyId);
        if (prop && prop.state_code) supplyStateCode = String(prop.state_code).trim();
        if (po.entity_id) {
          const { resolveBuyerGstin } = require('../services/entityGstResolver');
          buyerGstin = await resolveBuyerGstin({ entityId: po.entity_id, stateCode: supplyStateCode, clientId });
        }
      }
    } catch (e) { /* fall back to org state */ }
    const gstSplit = determineGstSplit({ vendorStateCode, supplyStateCode, gstAmount: gstAmountInput });
    const sameState = gstSplit.type === 'INTRA';

    const tdsRate = Number(vendor.tds_rate_percent || process.env.DEFAULT_TDS_RATE_PERCENT || 2);
    const tds_amount = baseAmount * (tdsRate / 100);

    if (String(process.env.ENFORCE_HSN_SAC || 'false').toLowerCase() === 'true' && !hsn_sac_code) {
      throw new AppError('HSN/SAC code is required for invoice compliance', 400);
    }

    const invoiceData = {
      // Explicit columns only — no ...req.body spread (would pass 'items' array and unknown fields)
      po_id,
      grn_id: grn_id || null,
      ses_id: ses_id || null,
      vendor_id,
      invoice_number,
      property_id: resolvedPropertyId,
      entity_id: po.entity_id || null, // Phase D - buying entity from PO
      location_id: po.location_id || null, // location arc - from PO
      buyer_gstin: buyerGstin, // Phase D - place-of-supply GSTIN (flag-gated; null otherwise)
      base_amount: baseAmount,
      gst_amount: gstAmountInput,
      total_amount,
      tds_amount,
      cgst_amount: gstSplit.cgst_amount,
      sgst_amount: gstSplit.sgst_amount,
      igst_amount: gstSplit.igst_amount,
      tds_rate_percent: tdsRate,
      tds_section_code: vendor.tds_section_code || null,
      hsn_sac_code: hsn_sac_code || null,
      itc_eligible: Boolean(is_itc_eligible),
      document_url: body.document_url || null,
      invoice_date: body.invoice_date || new Date(),
      status: match.matched ? 'UNPAID' : 'EXCEPTION',
      matching_status: match.matched ? 'MATCHED' : 'MISMATCHED',
      matching_exception_details: match.matched ? null : match.error,
      matching_tolerance_percent: tolerancePercent,
      matching_details_json: match,
      payment_blocked: !match.matched,
      payment_block_reason: match.matched ? null : `3-way match exception: ${match.error}`,
      exception_status: match.matched ? 'NONE' : 'OPEN',
      client_id: clientId
    };


    const invoice = await Invoice.create(invoiceData);

    // Canonical 3-way match drives BOTH the match record (page) AND the invoice status.
    try {
      const ThreeWayMatchService = require('../services/ThreeWayMatchService');
      const m = await ThreeWayMatchService.createOrUpdateMatch(invoice.id, clientId);
      await invoice.update(matchToInvoiceFields(m));
    } catch (e) { /* match enrichment must never block invoice creation */ }
    const TDSService = require('../services/TDSService');
    TDSService.computeTDS(invoice.id, clientId).catch(() => {
      // Fire-and-forget tax computation must never block invoice creation.
    });

    // If CAPEX, park invoice value in CWIP until capitalization.
    if (match.matched && po?.PurchaseRequisition?.type === 'CAPEX') {
      const { CwipAsset } = require('../models');
      const cwipCount = await CwipAsset.count();
      const cwip_number = `CWIP-${new Date().getFullYear()}-${String(cwipCount + 1).padStart(4, '0')}`;
      await CwipAsset.create({
        cwip_number,
        invoice_id: invoice.id,
        po_id,
        property_id: resolvedPropertyId,
        amount: total_amount,
        aging_days: 0,
        status: 'PARKED'
      });
    }

    // Trigger TALLY Sync
    await safeExecute(async () => {
      const { pushToQueue } = require('../services/integrationEngine');
      await pushToQueue('TALLY', 'POST_INVOICE', {
        ...invoice.toJSON(),
        date: invoice.createdAt || new Date(),
        vendor_name: invoice.vendor_id ? `Vendor-${invoice.vendor_id}` : 'Generic Vendor'
      });
    });


    logActivity({
      module: "PROCUREMENT",
      action: "CREATE_INVOICE",
      user_id: req.user.id,
      client_id: req.user.client_id,
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        matching_status: invoice.matching_status,
        payment_blocked: invoice.payment_blocked,
        tds_rate_percent: tdsRate,
        gst_split_mode: sameState ? 'CGST_SGST' : 'IGST'
      }
    }).catch(() => {});

    ImmutableAuditService.log({
      clientId,
      userId: req.user?.id,
      action: 'CREATE_INVOICE',
      module: 'PROCUREMENT',
      entityType: 'INVOICE',
      entityId: invoice.id,
      afterData: invoice.toJSON(),
      req
    });
    return { invoice, match };
  }
}
exports.recordInvoice = recordInvoice;

exports.resolveInvoiceException = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, comments } = req.body;
    const clientId = getClientId(req);
    const invWhere = { id };
    if (clientId) invWhere.client_id = clientId;
    const invoice = await Invoice.findOne({ where: invWhere });
    if (!invoice) throw new AppError('Invoice not found', 404);

    if (invoice.matching_status !== 'MISMATCHED' && invoice.exception_status !== 'OPEN') {
      return error(res, 'Invoice is not in open exception state', 400);
    }

    if (!['MANUAL_APPROVE', 'REJECT'].includes(String(action || '').toUpperCase())) {
      return error(res, 'Invalid action. Use MANUAL_APPROVE or REJECT', 400);
    }

    const isManualApprove = String(action).toUpperCase() === 'MANUAL_APPROVE';
    await invoice.update({
      matching_status: isManualApprove ? 'MATCHED' : 'MISMATCHED',
      status: isManualApprove ? 'UNPAID' : 'EXCEPTION',
      payment_blocked: !isManualApprove,
      payment_block_reason: isManualApprove ? null : (comments || 'Exception rejected by approver'),
      exception_status: isManualApprove ? 'MANUAL_APPROVED' : 'REJECTED',
      exception_resolved_by: req.user.id,
      exception_resolved_at: new Date(),
      matching_exception_details: comments || invoice.matching_exception_details
    });

    logActivity({
      module: "PROCUREMENT",
      action: isManualApprove ? "INVOICE_EXCEPTION_APPROVED" : "INVOICE_EXCEPTION_REJECTED",
      user_id: req.user.id,
      client_id: req.user.client_id,
      metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number, comments: comments || null }
    }).catch(() => {});

    return success(res, invoice, isManualApprove ? 'Invoice exception manually approved and payment block released' : 'Invoice exception rejected and payment remains blocked');
  } catch (error) {
    return next(error);
  }
};

// CR-HYB-01: payment ownership (lightweight, per-client). External => payment is owned by an
// ERP (e.g. Oracle); FixTag is read-only and Mark-Paid is disabled. Default OFF => FixTag owns.
async function isPaymentExternal(clientId) {
  const { FeatureToggle } = require('../models');
  const t = (clientId && await FeatureToggle.findOne({ where: { feature_key: 'PAYMENT_EXTERNAL', client_id: clientId } }))
    || await FeatureToggle.findOne({ where: { feature_key: 'PAYMENT_EXTERNAL', client_id: null } });
  return !!(t && t.is_enabled);
}

exports.markInvoicePaid = async (req, res, next) => {
  try {
    const { id } = req.params;
    const clientId = getClientId(req);
    const invWhere = { id };
    if (clientId) invWhere.client_id = clientId;
    const invoice = await Invoice.findOne({ where: invWhere });
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (await isPaymentExternal(clientId)) {
      return error(res, 'Payment is managed in the external system (e.g. Oracle) — status will sync automatically. Manual Mark-Paid is disabled.', 400);
    }
    if (invoice.payment_blocked) {
      return error(res, invoice.payment_block_reason || 'Invoice is payment-blocked due to governance exception', 400);
    }
    if (String(invoice.matching_status || '').toUpperCase() === 'MISMATCHED') {
      return error(res, 'Payment is blocked until the three-way match exception is resolved', 400);
    }
    if (!['APPROVED_FOR_PAYMENT', 'APPROVED'].includes(String(invoice.status || '').toUpperCase())) {
      return error(res, 'Invoice must be approved for payment before it can be paid', 400);
    }
    if (invoice.status === 'PAID') {
      return success(res, invoice, 'Invoice is already marked as paid');
    }

    await invoice.update({ status: 'PAID' });
    logActivity({
      module: "PROCUREMENT",
      action: "INVOICE_MARKED_PAID",
      user_id: req.user.id,
      client_id: req.user.client_id,
      metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number }
    }).catch(() => {});

    return success(res, invoice, 'Invoice marked as paid');
  } catch (error) {
    return next(error);
  }
};

// CR-HYB-01: move a 3-way-matched invoice to APPROVED_FOR_PAYMENT (the export-ready boundary).
exports.approveInvoiceForPayment = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const invWhere = { id: req.params.id };
    if (clientId) invWhere.client_id = clientId;
    const invoice = await Invoice.findOne({ where: invWhere });
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.payment_blocked) return error(res, invoice.payment_block_reason || 'Invoice is payment-blocked', 400);
    if (invoice.matching_status === 'MISMATCHED') return error(res, 'Invoice has a 3-way match mismatch — resolve before approving for payment.', 400);
    await invoice.update({ status: 'APPROVED_FOR_PAYMENT' });
    logActivity({ module: 'PROCUREMENT', action: 'INVOICE_APPROVED_FOR_PAYMENT', user_id: req.user?.id, client_id: req.user?.client_id, metadata: { invoice_id: invoice.id } }).catch(() => {});
    return success(res, invoice, 'Invoice approved for payment');
  } catch (error) { return next(error); }
};

// CR-HYB-01: record an external (Oracle) payment on an invoice. Manual/UAT stand-in for the
// future inbound sync (CR-HYB-03) — writes the exact fields the real sync will populate.
exports.recordExternalPayment = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const invWhere = { id: req.params.id };
    if (clientId) invWhere.client_id = clientId;
    const invoice = await Invoice.findOne({ where: invWhere });
    if (!invoice) throw new AppError('Invoice not found', 404);
    const { external_payment_ref, payment_date, payment_source } = req.body;
    await invoice.update({
      status: 'PAID',
      payment_source: payment_source || 'ORACLE',
      external_payment_ref: external_payment_ref || null,
      payment_date: payment_date ? new Date(payment_date) : new Date(),
      payment_synced_at: new Date(),
    });
    logActivity({ module: 'PROCUREMENT', action: 'INVOICE_EXTERNAL_PAYMENT_RECORDED', user_id: req.user?.id, client_id: req.user?.client_id, metadata: { invoice_id: invoice.id, ref: external_payment_ref } }).catch(() => {});
    return success(res, invoice, 'External payment recorded');
  } catch (error) { return next(error); }
};

exports.updateInvoice = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const where = { id: req.params.id };
    if (clientId) where.client_id = clientId;
    const invoice = await Invoice.findOne({ where });
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.status === 'PAID') throw new AppError('A paid invoice cannot be edited', 400);

    const patch = {};
    if (req.body.invoice_number !== undefined) patch.invoice_number = String(req.body.invoice_number).trim();
    if (req.body.invoice_date !== undefined) patch.invoice_date = req.body.invoice_date;
    if (req.body.hsn_sac_code !== undefined) patch.hsn_sac_code = req.body.hsn_sac_code;
    if (req.body.grn_id !== undefined) patch.grn_id = req.body.grn_id || null;
    if (req.body.ses_id !== undefined) {
      patch.ses_id = req.body.ses_id || null;
      if (patch.ses_id) await assertSesInvoiceable(patch.ses_id, { clientId, poId: invoice.po_id, exceptInvoiceId: invoice.id });
    }
    if ((patch.grn_id !== undefined ? patch.grn_id : invoice.grn_id) && (patch.ses_id !== undefined ? patch.ses_id : invoice.ses_id)) {
      throw new AppError('Link the invoice to a GRN (goods) or a service entry sheet (services), not both', 400);
    }
    if (req.body.base_amount !== undefined || req.body.gst_amount !== undefined) {
      const base = Number(req.body.base_amount != null ? req.body.base_amount : invoice.base_amount || 0);
      const gst = Number(req.body.gst_amount != null ? req.body.gst_amount : invoice.gst_amount || 0);
      patch.base_amount = base;
      patch.gst_amount = gst;
      patch.total_amount = base + gst;
    }
    // Duplicate invoice number guard (tenant-scoped), excluding self
    if (patch.invoice_number && patch.invoice_number !== invoice.invoice_number) {
      const dup = await Invoice.findOne({ where: { invoice_number: patch.invoice_number, ...(clientId ? { client_id: clientId } : {}) } });
      if (dup && dup.id !== invoice.id) throw new AppError('Invoice number already exists', 400);
    }
    await invoice.update(patch);

    // Canonical 3-way match (same engine as the 3-Way Match page) -> invoice status.
    try {
      const ThreeWayMatchService = require('../services/ThreeWayMatchService');
      const m = await ThreeWayMatchService.createOrUpdateMatch(invoice.id, clientId);
      await invoice.update(matchToInvoiceFields(m));
    } catch (e) { /* match non-blocking */ }

    // Snapshot the place-of-supply buyer GSTIN if it was not set at creation (flag-gated).
    if (!invoice.buyer_gstin && invoice.entity_id) {
      try {
        const { isPlaceOfSupplyEnabled, resolveBuyerGstin } = require('../services/entityGstResolver');
        if (await isPlaceOfSupplyEnabled(clientId)) {
          const prop = invoice.property_id ? await Property.findByPk(invoice.property_id) : null;
          const bg = await resolveBuyerGstin({ entityId: invoice.entity_id, stateCode: prop && prop.state_code, clientId });
          if (bg) await invoice.update({ buyer_gstin: bg });
        }
      } catch (e) { /* non-blocking */ }
    }

    return success(res, invoice, 'Invoice updated successfully');
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

exports.getInvoices = async (req, res, next) => {
  try {
    const invoices = await Invoice.findAll({
      where: buildAdminWhere(req),
      include: [
        { model: PurchaseOrder },
        { model: Property, attributes: ['id', 'property_name'] },
        { model: Location, attributes: ['id', 'location_name'], required: false },
        { model: Vendor },
        { model: GRN, attributes: ['id', 'grn_number'], required: false },
        { model: sequelize.models.ServiceEntrySheet, attributes: ['id', 'ses_number', 'total_value'], required: false }
      ],
      order: [['createdAt', 'DESC']]
    });
    if (String(req.user?.role || '').toUpperCase() === 'VENDOR') {
      const owner = await User.findByPk(req.user.id, { attributes: ['vendor_id'] });
      const ownVendorId = Number(owner?.vendor_id || 0);
      const own = ownVendorId ? invoices.filter((invoice) => Number(invoice.vendor_id) === ownVendorId) : [];
      return success(res, own);
    }
    return success(res, invoices);
  } catch (error) {
    res.json({ success: true, data: [] });
  }
};

// GET Approved POs eligible for GRN (not fully received)
exports.getApprovedPOsForGRN = async (req, res, next) => {
  try {
    const { Op } = require('sequelize');


    const poList = await PurchaseOrder.findAll({
      where: {
        status: { [Op.in]: ['ISSUED', 'PARTIAL_RECEIVED'] },
        ...buildAdminWhere(req)
      },
      include: [
        { model: PurchaseRequisition, attributes: ['pr_number', 'type'] },
        { model: Vendor, attributes: ['id', 'vendor_name'] },
        { model: Property, attributes: ['id', 'property_name'] },
        { model: PurchaseOrderItem, as: 'items' }
      ],
      order: [['createdAt', 'DESC']]
    });
    poList.forEach(po => {
    });

    return success(res, poList, `${poList.length} PO(s) available for inwarding`);
  } catch (error) {
    next(error);
  }
};

exports.getGRNItems = async (req, res, next) => {
  try {
    const { GRNItem, PurchaseOrder, Vendor } = require('../models');
    const items = await GRNItem.findAll({
      include: [
        {
          model: PurchaseOrderItem,
          required: true,
          include: [
            {
              model: PurchaseOrder,
              required: true,
              where: buildAdminWhere(req),
              include: [{ model: Vendor }]
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return success(res, items);
  } catch (error) {
    next(error);
  }
};

exports.getApprovalHistory = async (req, res, next) => {
  try {
    const { module, id } = req.params;

    const logs = await ApprovalLog.findAll({
      where: { module, reference_id: id },
      include: [{ model: User, attributes: ['first_name', 'last_name', 'username'] }],
      order: [['timestamp', 'DESC']]
    });
    sendResponse(res, 200, logs);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
// --- Quotation Management (NEW) ---

exports.createQuotation = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      pr_id, vendor_id, valid_until, currency,
      items, tax_amount = 0, discount_amount = 0, shipping_charges = 0, remarks
    } = req.body;
    const { Quotation, QuotationItem } = require('../models');

    // 1. Critical Validation
    if (!vendor_id) return res.status(400).json({ success: false, message: 'Vendor is required' });
    if (!items || !items.length) return res.status(400).json({ success: false, message: 'At least one item is required' });

    // 2. Foreign Key Check
    const vend = await Vendor.findByPk(vendor_id);
    if (!vend) return res.status(400).json({ success: false, message: 'Invalid selection: Vendor not found' });

    if (!vendor_id) throw new AppError('Vendor is required', 400);
    if (!items || !items.length) throw new AppError('At least one item is required', 400);

    // FT-002 Batch 1b: unified tenant derivation + vendor (silent) + PR (emit) ownership
    const clientId = getClientId(req) || vend.client_id;
    if (!clientId) throw new AppError('Unable to determine tenant for quotation', 400);
    if (vend.client_id && Number(vend.client_id) !== Number(clientId)) {
      throw new AppError('Selected vendor does not belong to your tenant', 403);
    }
    let qtnRefPr = null;
    if (pr_id) {
      qtnRefPr = await PurchaseRequisition.findByPk(pr_id);
      if (!qtnRefPr) throw new AppError('Referenced PR not found', 400);
      if (Number(qtnRefPr.client_id) !== Number(clientId)) {
        recordTenantViolation({ user_id: req.user && req.user.id, actor_client_id: getClientId(req), target_model: 'PurchaseRequisition', target_id: qtnRefPr.id, request_path: req.originalUrl, ip_address: req.ip, actor_role: req.user && req.user.role });
        throw new AppError('Selected PR does not belong to your tenant', 403);
      }
    }
    const qtnCodes = qtnRefPr
      ? await resolveNumCodes({ entity_id: qtnRefPr.entity_id, department_id: qtnRefPr.department_id }, transaction)
      : { entityCode: null, departmentCode: null };
    const quotation_number = await getNextNumber(clientId, 'QUOTATION', transaction, { entityCode: qtnCodes.entityCode, departmentCode: qtnCodes.departmentCode });

    let total_amount = 0;
    const qtnItems = items.map(item => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price || 0);
      const tax = Number(item.tax_amount || 0);
      const discount = Number(item.discount_amount || 0);

      const lineTotal = (qty * price) + tax - discount;
      total_amount += lineTotal;

      return {
        ...item,
        quantity: qty,
        unit_price: price,
        tax_amount: tax,
        discount_amount: discount,
        total_amount: lineTotal,
        uom: item.unit || 'Nos' // Map 'unit' from UI to 'uom' in DB
      };
    });

    const net_amount = total_amount + Number(shipping_charges || 0);

    const quotation = await Quotation.create({
      quotation_number,
      client_id: clientId,
      pr_id: pr_id || null,
      vendor_id,
      valid_until,
      currency: currency || 'INR',
      total_amount,
      tax_amount: tax_amount || 0,
      discount_amount: discount_amount || 0,
      shipping_charges: shipping_charges || 0,
      net_amount,
      remarks,
      created_by: req.user.id,
      status: 'DRAFT'
    }, { transaction });

    await QuotationItem.bulkCreate(qtnItems.map(item => ({ ...item, quotation_id: quotation.id })), { transaction });

    await transaction.commit();
    sendResponse(res, 201, quotation, 'Quotation created successfully');
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }

};

exports.getQuotations = async (req, res, next) => {
  try {
    const where = buildAdminWhere(req);

    const quotations = await Quotation.findAll({
      where,

      include: [
        {
          model: Vendor,
          as: "vendor",
          attributes: ["id", "vendor_name"],
          required: false
        },
        {
          model: PurchaseRequisition,
          as: 'PR',
          attributes: ['id', 'pr_number'],
          required: false
        },
        {
          model: QuotationItem,
          as: "items",
          required: false,
          include: [
            {
              model: Item,
              as: "item",
              attributes: ["id", "item_name"],
              required: false
            }
          ]
        }
      ],

      order: [['createdAt', 'DESC']]
    });

    return success(res, quotations);

  } catch (err) {
    next(err);
  }
};



exports.getQuotationById = async (req, res, next) => {
  try {

    const quotation = await findOneTenanted(Quotation, req.params.id, req, {
      include: [
        { model: QuotationItem, as: 'items' },
        // Quotation.belongsTo(Vendor) is declared with as: 'vendor' (lowercase);
        // using 'Vendor' here threw EagerLoadingError and 500'd the request.
        { model: Vendor, as: 'vendor' },
        { model: PurchaseRequisition, as: 'PR' }
      ]
    });
    if (!quotation) throw new AppError('Quotation not found', 404);
    sendResponse(res, 200, quotation);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

exports.updateQuotationStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const quotation = await findOneTenanted(Quotation, req.params.id, req);
    if (!quotation) throw new AppError('Quotation not found', 404);

    await quotation.update({ status });
    sendResponse(res, 200, quotation, `Quotation status updated to ${status}`);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

exports.getQuotationComparison = async (req, res, next) => {
  try {
    const { pr_id } = req.query;
    if (!pr_id) throw new AppError('PR ID is required for comparison', 400);

    const where = buildAdminWhere(req);

    const quotations = await Quotation.findAll({
      where: {
        pr_id,
        status: { [Op.in]: ['SUBMITTED', 'APPROVED'] },
        ...where
      },
      include: [
        { model: QuotationItem, as: 'items' },
        {
          model: Vendor,
          as: 'vendor',
          attributes: ['id', 'vendor_name'],
          required: false
        }
      ]
    });

    return success(res, rankQuotations(quotations).ranked); // CR-P02 ranked L1/L2/L3
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

exports.approveQuotation = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const qWhere = { id: req.params.id };
    if (clientId) qWhere.client_id = clientId;
    const quotation = await Quotation.findOne({ where: qWhere });
    if (!quotation) throw new AppError('Quotation not found', 404);

    // Rank this quote among peers for the same PR by net_amount (dense; L1 = lowest).
    let rank = 1, lowest = Number(quotation.net_amount || 0);
    if (quotation.pr_id) {
      const peers = await Quotation.findAll({ where: { pr_id: quotation.pr_id, ...(clientId ? { client_id: clientId } : {}), status: { [Op.in]: ['SUBMITTED', 'APPROVED'] } } });
      const amounts = peers.map((p) => Number(p.net_amount || 0)).filter((n) => n > 0);
      const uniq = [...new Set(amounts)].sort((a, z) => a - z);
      if (uniq.length) { lowest = uniq[0]; const idx = uniq.indexOf(Number(quotation.net_amount || 0)); rank = idx >= 0 ? idx + 1 : 1; }
    }

    const deviation_reason = (req.body && req.body.deviation_reason) ? String(req.body.deviation_reason).trim() : '';
    if (rank > 1 && !deviation_reason) {
      throw new AppError('Justification required: this is L' + rank + ' (lowest/L1 is Rs ' + Number(lowest).toLocaleString('en-IN') + '). Provide a reason for the deviation from L1.', 400);
    }

    await quotation.update({ status: 'APPROVED', is_selected: true, selected_rank: rank, deviation_reason: deviation_reason || null });

    // #2 (the client): the other quotations for this PR become NOT_APPROVED (reusable), not REJECTED.
    // Reset BOTH still-SUBMITTED peers AND any previously-APPROVED winner, so is_selected is
    // exclusive per PR (re-awarding an alternate clears the old award). REJECTED ones stay rejected.
    if (quotation.pr_id) {
      await Quotation.update(
        { status: 'NOT_APPROVED', is_selected: false },
        { where: { pr_id: quotation.pr_id, ...(clientId ? { client_id: clientId } : {}), status: { [Op.in]: ['SUBMITTED', 'APPROVED'] }, id: { [Op.ne]: quotation.id } } }
      );
    }

    try {
      ImmutableAuditService.log({ clientId, userId: req.user && req.user.id, action: 'AWARD_QUOTATION', module: 'PROCUREMENT', entityType: 'QUOTATION', entityId: quotation.id, afterData: { quotation_number: quotation.quotation_number, vendor_id: quotation.vendor_id, selected_rank: rank, deviation_reason: deviation_reason || null, net_amount: quotation.net_amount }, req });
    } catch (e) { /* audit non-blocking */ }

    // RFQ quotations: prepare the vendor email for an admin to review. Never sent automatically,
    // and a failure here must not undo the award.
    let emailDraft = null;
    try {
      const { prepareDraft } = require('../services/vendorEmail.service');
      const { recordAudit } = require('../utils/financeAudit');
      const prepared = await prepareDraft({ quotationId: quotation.id, clientId: quotation.client_id, userId: req.user && req.user.id });
      if (prepared.created) {
        await recordAudit(req, { module: 'RFQ', entityType: 'VENDOR_EMAIL', entityId: prepared.draft.id, action: 'VENDOR_EMAIL_DRAFTED', after: prepared.draft, note: 'Prepared automatically when the quotation was awarded' });
      }
      emailDraft = { id: prepared.draft.id, status: prepared.draft.status, email_type: prepared.draft.email_type };
    } catch (e) { /* not an RFQ quotation, or draft preparation failed: award still stands */ }

    const awarded = emailDraft ? { ...quotation.toJSON(), email_draft: emailDraft } : quotation;
    return success(res, awarded, rank > 1 ? ('Quotation awarded (L' + rank + ' — deviation recorded)') : 'Quotation awarded (L1)');
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

exports.rejectQuotation = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const qWhere = { id: req.params.id };
    if (clientId) qWhere.client_id = clientId;
    const quotation = await Quotation.findOne({ where: qWhere });
    if (!quotation) throw new AppError('Quotation not found', 404);
    await quotation.update({ status: 'REJECTED' });
    return success(res, quotation, 'Quotation rejected');
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

// --- End of Quotation Management ---

exports.uploadInvoiceDocument = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const invoice = await Invoice.findOne({
      where: { id: req.params.id, client_id: clientId }
    });
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload invoice file' });
    }
    await require('../utils/fileStore').persistUpload(req.file); // keep a copy in the bucket, if configured
    const document_url = `/uploads/invoices/${req.file.filename}`;
    await invoice.update({ document_url });
    return res.status(200).json({ success: true, data: { id: invoice.id, document_url } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Invoice upload failed' });
  }
};


// Get vendors associated with an asset (PO vendor + AMC vendors + tagged vendors)
exports.getVendorsForAsset = async (req, res) => {
  try {
    const assetId = req.params.assetId;
    const clientId = getClientId(req);
    const vendorMap = new Map();

    // 1. Vendor from asset record (original PO vendor)
    const asset = await Asset.findOne({
      where: { id: assetId, ...(clientId ? { client_id: clientId } : {}) },
      include: [{ model: Vendor, required: false }]
    });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    if (asset.Vendor) vendorMap.set(asset.Vendor.id, { ...asset.Vendor.toJSON(), source: 'PO' });

    // 2. AMC vendors
    const { AssetAMC } = require('../models');
    const amcs = await AssetAMC.findAll({
      where: { asset_id: assetId },
      include: [{ model: Vendor, required: false }]
    });
    amcs.forEach(a => {
      if (a.Vendor && !vendorMap.has(a.Vendor.id)) vendorMap.set(a.Vendor.id, { ...a.Vendor.toJSON(), source: 'AMC' });
    });

    return success(res, Array.from(vendorMap.values()));
  } catch (err) {
    return error(res, err.message || 'Failed to fetch vendors for asset');
  }
};


// CFG-02 — Send an issued PO to the selected vendor by email (PDF attached, CC procurement, editable note)
exports.sendPoToVendor = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const { id } = req.params;
    const { note, cc } = req.body || {};

    const po = await PurchaseOrder.findOne({
      where: { id, client_id: clientId },
      include: [{ model: Vendor, required: false }, { model: Entity, as: 'Entity', required: false }]
    });
    if (!po) return error(res, 'Purchase Order not found', 404);
    if (po.status !== 'ISSUED') return error(res, 'PO must be issued (approved) before it can be sent to the vendor', 400);

    const vendor = po.Vendor || (po.vendor_id ? await Vendor.findOne({ where: { id: po.vendor_id, client_id: clientId } }) : null);
    const vendorEmail = vendor && vendor.email;
    if (!vendorEmail) return error(res, 'Vendor has no email on file — add it to the vendor master first', 400);

    // CC precedence: request override -> tenant procurement CC (entity-specific then client) -> none
    let ccEmail = (cc && String(cc).trim()) || null;
    if (!ccEmail) {
      const { PoPrintConfig } = require('../models');
      const cfg = (po.entity_id
        ? await PoPrintConfig.findOne({ where: { client_id: clientId, entity_id: po.entity_id } })
        : null) || await PoPrintConfig.findOne({ where: { client_id: clientId } });
      ccEmail = (cfg && cfg.procurement_cc_email) || null;
    }

    const { generatePoPdf } = require('../services/poPrint.service');
    const pdf = await generatePoPdf(po.id, clientId);

    const poNo = po.po_number || po.id;
    const entityName = (po.Entity && po.Entity.name) ? ' — ' + po.Entity.name : '';
    const subject = `Purchase Order ${poNo}${entityName}`;
    const trimmedNote = note && String(note).trim();
    const bodyNote = trimmedNote
      ? String(note).replace(/\n/g, '<br>')
      : `Dear ${(vendor.contact_person || 'Sir/Madam')},<br><br>Please find attached our Purchase Order ${poNo}. Kindly acknowledge receipt and confirm delivery.<br><br>Regards,<br>Procurement`;
    const html = `<div style="font-family:Arial,sans-serif;color:#333;line-height:1.6;font-size:14px">${bodyNote}</div>`;

    const notificationEmail = require('../services/notificationEmail.service');
    const result = await notificationEmail.sendEmailWithAttachment({
      to: vendorEmail,
      cc: ccEmail ? [ccEmail] : [],
      subject,
      html,
      attachments: [{ filename: `PO-${String(poNo).replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' }]
    });
    if (!result.success) {
      return error(res, `Failed to send email: ${result.reason || result.error || 'email not configured'}`, 502);
    }

    await po.update({ vendor_email_sent_at: new Date(), vendor_email_sent_to: vendorEmail });
    ImmutableAuditService.log({
      clientId, userId: req.user && req.user.id, req,
      action: 'PO_SENT_TO_VENDOR', module: 'PROCUREMENT', entityType: 'PURCHASE_ORDER', entityId: po.id,
      afterData: { po_number: poNo, to: vendorEmail, cc: ccEmail, messageId: result.messageId }
    });

    return success(res, { sent_to: vendorEmail, cc: ccEmail, sent_at: po.vendor_email_sent_at, messageId: result.messageId }, 'Purchase Order sent to vendor');
  } catch (err) {
    return error(res, err.message || 'Failed to send PO to vendor');
  }
};

// Phase 1 (#9) — DOA Approval Status for a PO: level-by-level chain + per-step status.
exports.getPoApprovalStatus = async (req, res) => {
  try {
    const { DoaApprovalRequest, DoaApprovalStep, PurchaseOrder } = require('../models');
    const clientId = getClientId(req);
    const po = await PurchaseOrder.findOne({ where: { id: req.params.id, ...(clientId ? { client_id: clientId } : {}) } });
    if (!po || !(await canSeeRow(req, 'PO', po, { vendor: 'vendor_id' }))) return res.status(404).json({ success: false, message: 'PO not found' });
    const request = await DoaApprovalRequest.findOne({
      where: { module: 'PO', document_id: po.id, ...(clientId ? { client_id: clientId } : {}) },
      order: [['id', 'DESC']]
    });
    if (!request) return res.json({ success: true, data: { doa: false, po_status: po.status } });
    const steps = await DoaApprovalStep.findAll({ where: { request_id: request.id }, order: [['level', 'ASC'], ['id', 'ASC']] });
    const byLevel = {};
    for (const s of steps) {
      const L = s.level || 1;
      let eligible = [];
      if (s.requirement_type === 'ANY_ONE_OF') { try { eligible = JSON.parse(s.eligible_json || '[]'); } catch (e) { eligible = []; } }
      (byLevel[L] = byLevel[L] || []).push({
        requirement_type: s.requirement_type,
        approver_name: s.requirement_type === 'ANY_ONE_OF' ? ('Any 1 of ' + eligible.length) : s.approver_name,
        eligible: eligible.map((e) => e.approver_name),
        status: s.status, decided_at: s.decided_at, decided_by: s.decided_email || null
      });
    }
    const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b).map((L) => {
      const items = byLevel[L];
      const status = items.some((i) => i.status === 'REJECTED') ? 'REJECTED'
        : items.every((i) => i.status === 'APPROVED') ? 'APPROVED'
        : items.some((i) => i.status === 'APPROVED') ? 'IN_PROGRESS' : 'PENDING';
      return { level: L, status, approvers: items };
    });
    const active = levels.find((l) => l.status === 'PENDING' || l.status === 'IN_PROGRESS');
    return res.json({ success: true, data: {
      doa: true, request_status: request.status, po_status: po.status, amount: request.amount,
      active_level: active ? active.level : null, levels
    } });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// Phase 4a (#14/#15) — change a PO's vendor (e.g. L1 failed -> pick L2) and RE-RUN approval from scratch.
exports.changePoVendor = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const clientId = getClientId(req);
    const { vendor_id, reason } = req.body || {};
    const po = await PurchaseOrder.findOne({ where: { id: req.params.id, ...(clientId ? { client_id: clientId } : {}) }, transaction: t });
    if (!po) { await t.rollback(); return res.status(404).json({ success: false, message: 'PO not found' }); }
    // The approval engine requires a clientId. getClientId(req) is null for a PROVIDER_ADMIN
    // acting on a tenant's PO — fall back to the PO's own client so re-approval never throws
    // "clientId is required for the approval engine".
    const effClientId = clientId || po.client_id;
    if (['RECEIVED', 'FULLY_RECEIVED', 'CANCELLED'].includes(po.status)) { await t.rollback(); return res.status(400).json({ success: false, message: 'Cannot change vendor on a received or cancelled PO' }); }
    if (!vendor_id) { await t.rollback(); return res.status(400).json({ success: false, message: 'vendor_id required' }); }
    const vendor = await Vendor.findOne({ where: { id: vendor_id, ...(effClientId ? { client_id: effClientId } : {}) }, transaction: t });
    if (!vendor) { await t.rollback(); return res.status(400).json({ success: false, message: 'Vendor not found for this tenant' }); }

    // cancel any in-flight DOA request for this PO so the new one supersedes it
    const { DoaApprovalRequest } = require('../models');
    await DoaApprovalRequest.update({ status: 'REJECTED' }, { where: { module: 'PO', document_id: po.id, status: 'IN_PROGRESS', ...(effClientId ? { client_id: effClientId } : {}) }, transaction: t });

    await po.update({ vendor_id: vendor.id, vendor_name: vendor.vendor_name, status: 'SUBMITTED', is_fully_approved: false,
      approval_date: null, vendor_email_sent_at: null, vendor_email_sent_to: null }, { transaction: t });

    const { initiateApproval } = require('../services/approvalEngine');
    const approvalResult = await initiateApproval(po, 'PO', Number(po.total_amount || 0), req.user.id, t, effClientId);
    if (approvalResult && approvalResult.auto_approved && po.status === 'SUBMITTED') {
      await po.update({ status: 'ISSUED', is_fully_approved: true, approval_date: new Date() }, { transaction: t });
    }
    await t.commit();
    if (approvalResult && approvalResult.doa) { try { await require('../services/doaApproval.service').dispatchRequestEmails(approvalResult.request_id); } catch (e) { /* fail-open */ } }
    return res.json({ success: true, message: 'Vendor changed and approval re-triggered', data: { status: po.status, vendor: vendor.vendor_name } });
  } catch (e) { await t.rollback(); return res.status(500).json({ success: false, message: e.message }); }
};
