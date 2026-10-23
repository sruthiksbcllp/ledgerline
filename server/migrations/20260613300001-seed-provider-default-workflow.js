'use strict';

/**
 * FT-002 Batch 2B-0 — Provider-default approval workflow + matrix (PR, PO)
 * -----------------------------------------------------------------------
 * Seeds ONE provider-default workflow per module (client_id = NULL) with a single
 * AUTO_APPROVE matrix rule covering all amounts. This is the inheritance fallback
 * that getApplicableRulesForTenant (U3) resolves in Batch 2B-1.
 *
 * SAFETY (CTO, 2026-06-13) — seeded status = 'INACTIVE'.
 * The CURRENT (un-wired) engine getApplicableRules() is CLIENT-BLIND: it matches any
 * status='ACTIVE' workflow for the module with NO client_id filter. An ACTIVE
 * provider-default carrying a matrix would therefore be consumed by EVERY tenant's
 * PR/PO and break today's auto-approve path (E2E regression). Seeding INACTIVE makes
 * the artifact COMPLETE but INERT. Batch 2B-1 flips status -> ACTIVE ATOMICALLY with
 * the client-aware resolver, so activation never precedes the safe path.
 *
 * Idempotent (existence-checked) + reversible.
 */

const MODULES = ['PR', 'PO'];
const WF_NAME = 'Provider Default (Auto-Approve)';

async function tableColumns(queryInterface, table) {
  try { return Object.keys(await queryInterface.describeTable(table)); }
  catch (e) { return []; }
}

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    const wfCols = await tableColumns(queryInterface, 'approval_workflows');
    const hasCreatedAt = wfCols.includes('created_at');
    const hasUpdatedAt = wfCols.includes('updated_at');

    for (const module of MODULES) {
      // 1. Workflow (existence-checked — provider-default = client_id IS NULL).
      const [wf] = await q.query(
        `SELECT id FROM approval_workflows WHERE module = ? AND client_id IS NULL AND name = ? LIMIT 1`,
        { replacements: [module, WF_NAME] }
      );
      let workflowId = wf.length ? wf[0].id : null;

      if (!workflowId) {
        const cols = ['name', 'module', 'client_id', 'status', 'approval_topology', 'progression_mode'];
        const vals = ['?', '?', 'NULL', `'INACTIVE'`, `'COLLECTIVE'`, `'COLLECTIVE'`];
        const repl = [WF_NAME, module];
        if (hasCreatedAt) { cols.push('created_at'); vals.push('NOW()'); }
        if (hasUpdatedAt) { cols.push('updated_at'); vals.push('NOW()'); }
        await q.query(
          `INSERT INTO approval_workflows (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${vals.join(', ')})`,
          { replacements: repl }
        );
        const [ins] = await q.query(
          `SELECT id FROM approval_workflows WHERE module = ? AND client_id IS NULL AND name = ? ORDER BY id DESC LIMIT 1`,
          { replacements: [module, WF_NAME] }
        );
        workflowId = ins[0].id;
      }

      // 2. Matrix rule (existence-checked) — AUTO_APPROVE, all amounts, client_id NULL.
      const [mx] = await q.query(
        `SELECT id FROM approval_matrix WHERE workflow_id = ? AND role_code = 'AUTO_APPROVE' LIMIT 1`,
        { replacements: [workflowId] }
      );
      if (!mx.length) {
        await q.query(
          `INSERT INTO approval_matrix
             (workflow_id, client_id, module_name, level, role, role_code,
              min_amount, max_amount, threshold_amount, mode, is_mandatory, is_active)
           VALUES (?, NULL, ?, 1, 'Auto Approve', 'AUTO_APPROVE', 0, NULL, 0, 'COLLECTIVE', 0, 1)`,
          { replacements: [workflowId, module] }
        );
      }
    }
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    for (const module of MODULES) {
      const [wf] = await q.query(
        `SELECT id FROM approval_workflows WHERE module = ? AND client_id IS NULL AND name = ? LIMIT 1`,
        { replacements: [module, WF_NAME] }
      );
      if (!wf.length) continue;
      const id = wf[0].id;
      await q.query(`DELETE FROM approval_matrix WHERE workflow_id = ? AND role_code = 'AUTO_APPROVE'`, { replacements: [id] });
      await q.query(`DELETE FROM approval_workflows WHERE id = ?`, { replacements: [id] });
    }
  }
};
