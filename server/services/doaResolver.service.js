'use strict';
/**
 * DOA Phase 2 — approver-chain resolver (the core matrix logic).
 *
 * Given a tenant DOA policy (cumulative amount slabs, each adding approver specs) and an
 * amount, produce the ordered list of approval requirements:
 *   - SINGLE      : one specific approver (NAMED external email / FixTag user / a resolved
 *                   DYNAMIC head / ROLE).
 *   - ANY_ONE_OF  : satisfied by any one of a group (the client "1 of 4"), with de-dup applied.
 *
 * Cumulative model: every slab whose min_amount <= amount contributes its approvers.
 * De-dup: a person required once is required once (collapsed); and the ANY_ONE_OF group's
 * eligible set excludes members who are already a SINGLE requirement (the matrix footnote:
 * "if one of these is already an approver, 1 of the other three approves").
 *
 * Pure: resolveApprovers(policy, amount). Async: getApproverChain(clientId, expenseType,
 * amount) loads the policy and calls the pure function. DYNAMIC_* specs are passed through
 * with a resolve hint; the live-engine wiring (Phase 2b) resolves heads from org data.
 */
const { Op } = require('sequelize');

function approverKey(a) {
  // identity for de-dup: email > user_id > name > role
  return String(
    (a.approver_email && a.approver_email.toLowerCase()) ||
    (a.user_id != null ? `user:${a.user_id}` : '') ||
    (a.approver_name && a.approver_name.toLowerCase()) ||
    (a.role_code && `role:${a.role_code}`) ||
    (a.spec_type || '')
  );
}

/**
 * @param {object} policy  { expense_type, org_level, slabs:[{seq,min_amount,approvers:[...]}], groups:{key:[{approver_name,approver_email,user_id}]} }
 * @param {number} amount
 * @returns {{applicable_slabs:number[], requirements:Array}}
 */
function resolveApprovers(policy, amount) {
  const amt = Number(amount || 0);
  const slabs = (policy.slabs || []).filter((s) => amt >= Number(s.min_amount || 0));
  // Group approvers by position (= LEVEL). Levels run sequentially; approvers within a level in parallel.
  const byPos = new Map();
  for (const s of slabs) {
    for (const a of (s.approvers || [])) {
      const pos = Number(a.position || 1);
      if (!byPos.has(pos)) byPos.set(pos, []);
      byPos.get(pos).push(a);
    }
  }
  const positions = [...byPos.keys()].sort((x, y) => x - y);
  const seenSingle = new Set(); // de-dup a named person appearing at multiple levels
  const requirements = [];
  let level = 0;
  for (const pos of positions) {
    level++;
    const approvers = byPos.get(pos);
    const groupSpec = approvers.find((a) => a.spec_type === 'ANY_ONE_OF_GROUP');
    if (groupSpec) {
      const members = (policy.groups && policy.groups[groupSpec.group_key]) || [];
      const eligible = (groupSpec.is_dedup !== false) ? members.filter((m) => !seenSingle.has(approverKey(m))) : members.slice();
      requirements.push({ type: 'ANY_ONE_OF', level, group_key: groupSpec.group_key, count: 1,
        eligible: eligible.map((m) => ({ user_id: m.user_id || null, approver_name: m.approver_name || null, approver_email: m.approver_email || null })) });
    }
    for (const a of approvers) {
      if (a.spec_type === 'ANY_ONE_OF_GROUP') continue;
      // A concrete identity (named email / user / role) can be de-duped across levels
      // (the matrix footnote). Identity-less specs — MANUAL (picked at submit) and an
      // as-yet-unresolved DYNAMIC head — must NOT collapse: two manual levels are two levels.
      const hasIdentity = !!(a.approver_email || a.user_id != null || a.role_code ||
        (a.approver_name && a.spec_type !== 'MANUAL'));
      const k = approverKey(a);
      if (hasIdentity) { if (seenSingle.has(k)) continue; seenSingle.add(k); }
      requirements.push({ type: 'SINGLE', level, spec_type: a.spec_type, user_id: a.user_id || null,
        approver_name: a.approver_name || null, approver_email: a.approver_email || null, role_code: a.role_code || null,
        manual: a.spec_type === 'MANUAL' });
    }
  }
  return { applicable_positions: positions, requirements };
}

/**
 * Load the active policy for (client, expense_type) and resolve the chain for `amount`.
 * Returns null if no policy (caller falls back to today's matrix-mode approval).
 */
async function getApproverChain(clientId, expenseType, amount, departmentId = null, models = null) {
  const db = models || require('../models');
  const { DoaPolicy, DoaPolicySlab, DoaSlabApprover, DoaApproverGroup } = db;
  const policyRow = await DoaPolicy.findOne({
    where: { client_id: clientId, expense_type: expenseType, is_active: true,
      [Op.or]: [{ department_id: departmentId || null }, { department_id: null }] },
    order: [['department_id', 'DESC']] // prefer a department-specific policy over the tenant-wide one
  });
  if (!policyRow) return null;

  const slabRows = await DoaPolicySlab.findAll({ where: { policy_id: policyRow.id }, order: [['seq', 'ASC']] });
  const slabIds = slabRows.map((s) => s.id);
  const approverRows = slabIds.length ? await DoaSlabApprover.findAll({ where: { slab_id: { [Op.in]: slabIds } } }) : [];
  const groupKeys = [...new Set(approverRows.filter((a) => a.spec_type === 'ANY_ONE_OF_GROUP' && a.group_key).map((a) => a.group_key))];
  const groupRows = groupKeys.length ? await DoaApproverGroup.findAll({ where: { client_id: clientId, group_key: { [Op.in]: groupKeys } } }) : [];

  const groups = {};
  for (const gk of groupKeys) groups[gk] = groupRows.filter((g) => g.group_key === gk).map((g) => g.get({ plain: true }));

  const policy = {
    expense_type: policyRow.expense_type,
    org_level: policyRow.org_level,
    slabs: slabRows.map((s) => ({ seq: s.seq, min_amount: s.min_amount, max_amount: s.max_amount, approvers: approverRows.filter((a) => a.slab_id === s.id).map((a) => a.get({ plain: true })) })),
    groups
  };
  return { policy_id: policyRow.id, org_level: policyRow.org_level, department_id: policyRow.department_id, ...resolveApprovers(policy, amount) };
}

module.exports = { resolveApprovers, getApproverChain, approverKey };
