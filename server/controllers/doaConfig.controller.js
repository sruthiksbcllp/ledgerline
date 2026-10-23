'use strict';
/**
 * DOA Approval-Matrix configuration (Phase 2, #21/#10).
 * Admin CRUD so a tenant self-serves its Delegation-of-Authority matrices:
 *   Policy (Department x Expense) -> cost Slabs -> per-level Approvers (Named / Dynamic head / Any-1-of group).
 * All tenant-scoped. savePolicy upserts the WHOLE policy transactionally (replace slabs/approvers/groups).
 */
const { sequelize, DoaPolicy, DoaPolicySlab, DoaSlabApprover, DoaApproverGroup, Department } = require('../models');
const { Op } = require('sequelize');
const { getClientId } = require('../utils/tenantFilter');

const SPEC_TYPES = ['NAMED', 'ROLE', 'DYNAMIC_INITIATOR_HEAD', 'DYNAMIC_FACILITATOR_HEAD', 'ANY_ONE_OF_GROUP', 'MANUAL'];

// dropdown data
exports.getMeta = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const departments = await Department.findAll({ where: clientId ? { client_id: clientId } : {}, attributes: ['id', 'dept_name'], order: [['dept_name', 'ASC']] });
    return res.json({ success: true, data: {
      departments, expense_types: ['OPEX', 'CAPEX'], org_levels: ['SUB_LOB', 'LOB'], spec_types: SPEC_TYPES
    } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
};

// list policies (summary)
exports.listPolicies = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const policies = await DoaPolicy.findAll({ where: clientId ? { client_id: clientId } : {}, order: [['id', 'DESC']] });
    const depts = await Department.findAll({ where: clientId ? { client_id: clientId } : {}, attributes: ['id', 'dept_name'] });
    const deptMap = {}; depts.forEach((d) => { deptMap[d.id] = d.dept_name; });
    const out = [];
    for (const p of policies) {
      const slabCount = await DoaPolicySlab.count({ where: { policy_id: p.id } });
      out.push({ id: p.id, name: p.name, expense_type: p.expense_type, org_level: p.org_level,
        department_id: p.department_id, department_name: p.department_id ? (deptMap[p.department_id] || null) : 'Any',
        is_active: p.is_active, slab_count: slabCount });
    }
    return res.json({ success: true, data: out });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
};

// full policy (slabs + approvers + inlined group members)
exports.getPolicy = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const policy = await DoaPolicy.findOne({ where: { id: req.params.id, ...(clientId ? { client_id: clientId } : {}) } });
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });
    const slabs = await DoaPolicySlab.findAll({ where: { policy_id: policy.id }, order: [['seq', 'ASC'], ['min_amount', 'ASC']] });
    const slabIds = slabs.map((s) => s.id);
    const approvers = slabIds.length ? await DoaSlabApprover.findAll({ where: { slab_id: { [Op.in]: slabIds } }, order: [['position', 'ASC'], ['id', 'ASC']] }) : [];
    const groupKeys = [...new Set(approvers.filter((a) => a.group_key).map((a) => a.group_key))];
    const groupRows = groupKeys.length ? await DoaApproverGroup.findAll({ where: { client_id: policy.client_id, group_key: { [Op.in]: groupKeys } } }) : [];
    const groupMembers = {}; groupKeys.forEach((k) => { groupMembers[k] = groupRows.filter((g) => g.group_key === k).map((g) => ({ approver_name: g.approver_name, approver_email: g.approver_email })); });
    const data = {
      id: policy.id, name: policy.name, expense_type: policy.expense_type, org_level: policy.org_level,
      department_id: policy.department_id, is_active: policy.is_active,
      slabs: slabs.map((s) => ({
        min_amount: Number(s.min_amount), max_amount: s.max_amount != null ? Number(s.max_amount) : null, label: s.label,
        approvers: approvers.filter((a) => a.slab_id === s.id).map((a) => ({
          position: a.position, spec_type: a.spec_type, approver_name: a.approver_name, approver_email: a.approver_email,
          role_code: a.role_code, group_key: a.group_key, members: a.group_key ? (groupMembers[a.group_key] || []) : []
        }))
      }))
    };
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
};

// upsert whole policy transactionally
exports.savePolicy = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const clientId = getClientId(req);
    if (!clientId) { await t.rollback(); return res.status(400).json({ success: false, message: 'Tenant context required' }); }
    const b = req.body || {};
    if (!b.expense_type || !['OPEX', 'CAPEX'].includes(b.expense_type)) { await t.rollback(); return res.status(400).json({ success: false, message: 'expense_type OPEX/CAPEX required' }); }

    let policy;
    if (b.id) {
      policy = await DoaPolicy.findOne({ where: { id: b.id, client_id: clientId }, transaction: t });
      if (!policy) { await t.rollback(); return res.status(404).json({ success: false, message: 'Policy not found' }); }
      // clear existing slabs/approvers/groups for this policy
      const oldSlabs = await DoaPolicySlab.findAll({ where: { policy_id: policy.id }, transaction: t });
      const oldApprovers = oldSlabs.length ? await DoaSlabApprover.findAll({ where: { slab_id: { [Op.in]: oldSlabs.map((s) => s.id) } }, transaction: t }) : [];
      const oldGroupKeys = [...new Set(oldApprovers.filter((a) => a.group_key).map((a) => a.group_key))];
      if (oldGroupKeys.length) await DoaApproverGroup.destroy({ where: { client_id: clientId, group_key: { [Op.in]: oldGroupKeys } }, transaction: t });
      if (oldSlabs.length) await DoaSlabApprover.destroy({ where: { slab_id: { [Op.in]: oldSlabs.map((s) => s.id) } }, transaction: t });
      await DoaPolicySlab.destroy({ where: { policy_id: policy.id }, transaction: t });
      await policy.update({ expense_type: b.expense_type, org_level: b.org_level || 'SUB_LOB', department_id: b.department_id || null, name: b.name || policy.name, is_active: b.is_active !== false }, { transaction: t });
    } else {
      policy = await DoaPolicy.create({ client_id: clientId, expense_type: b.expense_type, org_level: b.org_level || 'SUB_LOB', department_id: b.department_id || null, name: b.name || 'DOA Policy', is_active: b.is_active !== false }, { transaction: t });
    }

    let gseq = 0;
    for (let si = 0; si < (b.slabs || []).length; si++) {
      const s = b.slabs[si];
      const slab = await DoaPolicySlab.create({ client_id: clientId, policy_id: policy.id, seq: si + 1, min_amount: Number(s.min_amount || 0), max_amount: s.max_amount != null && s.max_amount !== '' ? Number(s.max_amount) : null, label: s.label || null }, { transaction: t });
      for (const a of (s.approvers || [])) {
        let groupKey = a.group_key || null;
        if (a.spec_type === 'ANY_ONE_OF_GROUP') {
          groupKey = groupKey || `grp_${policy.id}_${++gseq}`;
          for (const m of (a.members || [])) {
            if (!m.approver_email && !m.approver_name) continue;
            await DoaApproverGroup.create({ client_id: clientId, group_key: groupKey, approver_name: m.approver_name || null, approver_email: m.approver_email || null }, { transaction: t });
          }
        }
        await DoaSlabApprover.create({ client_id: clientId, slab_id: slab.id, spec_type: a.spec_type || 'NAMED', position: Number(a.position || 1),
          approver_name: a.approver_name || null, approver_email: a.approver_email || null, role_code: a.role_code || null, group_key: groupKey, is_dedup: a.is_dedup !== false }, { transaction: t });
      }
    }
    await t.commit();
    return res.json({ success: true, data: { id: policy.id }, message: 'Policy saved' });
  } catch (e) { await t.rollback(); return res.status(500).json({ success: false, message: e.message }); }
};

exports.deletePolicy = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const clientId = getClientId(req);
    const policy = await DoaPolicy.findOne({ where: { id: req.params.id, ...(clientId ? { client_id: clientId } : {}) }, transaction: t });
    if (!policy) { await t.rollback(); return res.status(404).json({ success: false, message: 'Policy not found' }); }
    const slabs = await DoaPolicySlab.findAll({ where: { policy_id: policy.id }, transaction: t });
    const approvers = slabs.length ? await DoaSlabApprover.findAll({ where: { slab_id: { [Op.in]: slabs.map((s) => s.id) } }, transaction: t }) : [];
    const gk = [...new Set(approvers.filter((a) => a.group_key).map((a) => a.group_key))];
    if (gk.length) await DoaApproverGroup.destroy({ where: { client_id: policy.client_id, group_key: { [Op.in]: gk } }, transaction: t });
    if (slabs.length) await DoaSlabApprover.destroy({ where: { slab_id: { [Op.in]: slabs.map((s) => s.id) } }, transaction: t });
    await DoaPolicySlab.destroy({ where: { policy_id: policy.id }, transaction: t });
    await policy.destroy({ transaction: t });
    await t.commit();
    return res.json({ success: true, message: 'Policy deleted' });
  } catch (e) { await t.rollback(); return res.status(500).json({ success: false, message: e.message }); }
};

// Phase 3a — per-department head mapping (drives DYNAMIC_INITIATOR_HEAD / DYNAMIC_FACILITATOR_HEAD).
exports.getDepartmentHeads = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const { DoaDepartmentHead } = require('../models');
    const heads = await DoaDepartmentHead.findAll({ where: clientId ? { client_id: clientId } : {} });
    const depts = await Department.findAll({ where: clientId ? { client_id: clientId } : {}, attributes: ['id', 'dept_name'], order: [['dept_name', 'ASC']] });
    const map = {}; heads.forEach((h) => { map[h.department_id] = h; });
    const rows = depts.map((d) => { const h = map[d.id] || {}; return { department_id: d.id, department_name: d.dept_name,
      sublob_head_name: h.sublob_head_name || '', sublob_head_email: h.sublob_head_email || '',
      facilitator_head_name: h.facilitator_head_name || '', facilitator_head_email: h.facilitator_head_email || '' }; });
    return res.json({ success: true, data: rows });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
};
exports.saveDepartmentHead = async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, message: 'Tenant context required' });
    const { DoaDepartmentHead } = require('../models');
    const b = req.body || {};
    if (!b.department_id) return res.status(400).json({ success: false, message: 'department_id required' });
    const [row] = await DoaDepartmentHead.findOrCreate({ where: { client_id: clientId, department_id: b.department_id }, defaults: { client_id: clientId, department_id: b.department_id } });
    await row.update({ sublob_head_name: b.sublob_head_name || null, sublob_head_email: b.sublob_head_email || null,
      facilitator_head_name: b.facilitator_head_name || null, facilitator_head_email: b.facilitator_head_email || null });
    return res.json({ success: true, message: 'Department head saved' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
};


// ── Phase 3b: preview the resolved approval chain for a prospective PO ──────
// Body/query: { pr_id? , department_id?, expense_type? (CAPEX/OPEX), amount? }
// Returns the ordered levels so the PO form can prompt for MANUAL-level approvers.
const { getApproverChain } = require('../services/doaResolver.service');
const { isDoaEnabled } = require('../services/doaApproval.service');
const { PurchaseRequisition } = require('../models');
const SPEC_LABEL = {
  NAMED: 'Named person', ROLE: 'Role', DYNAMIC_INITIATOR_HEAD: "Initiator's Sub-LoB Head",
  DYNAMIC_FACILITATOR_HEAD: 'Facilitator Head', ANY_ONE_OF_GROUP: 'Any one of a group', MANUAL: 'Manual (pick at submit)'
};
exports.previewChain = async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, message: 'Tenant context required' });
    const src = { ...req.query, ...req.body };
    let departmentId = src.department_id ? Number(src.department_id) : null;
    let expenseType = src.expense_type || null;
    let amount = Number(src.amount || 0);
    if (src.pr_id) {
      const pr = await PurchaseRequisition.findOne({ where: { id: src.pr_id, client_id: clientId } });
      if (pr) {
        departmentId = departmentId || pr.department_id || null;
        expenseType = expenseType || pr.type || null;
        if (!amount) amount = Number(pr.total_estimated_cost || 0);
      }
    }
    if (!expenseType) return res.json({ success: true, data: { doa: false, reason: 'No expense type (CAPEX/OPEX)' } });
    const enabled = await isDoaEnabled(clientId);
    if (!enabled) return res.json({ success: true, data: { doa: false, reason: 'DOA not enabled' } });
    const chain = await getApproverChain(clientId, expenseType, amount, departmentId);
    if (!chain) return res.json({ success: true, data: { doa: false, reason: 'No DOA policy for this department/type' } });
    const levels = {};
    for (const r of chain.requirements) {
      const lv = r.level || 1;
      if (!levels[lv]) levels[lv] = { level: lv, approvers: [], has_manual: false };
      levels[lv].approvers.push({
        type: r.type, spec_type: r.spec_type || (r.type === 'ANY_ONE_OF' ? 'ANY_ONE_OF_GROUP' : 'NAMED'),
        label: SPEC_LABEL[r.spec_type] || (r.type === 'ANY_ONE_OF' ? 'Any one of a group' : 'Named person'),
        approver_name: r.approver_name || null, approver_email: r.approver_email || null, manual: !!r.manual
      });
      if (r.manual) levels[lv].has_manual = true;
    }
    const ordered = Object.values(levels).sort((a, b) => a.level - b.level);
    const manual_levels = ordered.filter((l) => l.has_manual).map((l) => l.level);
    return res.json({ success: true, data: { doa: true, expense_type: expenseType, amount, department_id: departmentId, levels: ordered, manual_levels } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
};
