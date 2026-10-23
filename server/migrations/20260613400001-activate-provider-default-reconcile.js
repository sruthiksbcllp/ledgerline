'use strict';

/**
 * FT-002 Batch 2B-1 — provider-default reconciliation.
 * Guarantees EXACTLY ONE ACTIVE provider-default workflow (client_id IS NULL) per module:
 *   1. Find the canonical 'Provider Default (Auto-Approve)' workflow (seeded INACTIVE in 2B-0), BY NAME.
 *   2. Deactivate every OTHER client_id-NULL workflow for that module (strays). No "first-row" behavior.
 *   3. Activate the canonical.
 *   4. Tenant workflows (client_id IS NOT NULL) are NEVER touched.
 * Deterministic, idempotent, reversible.
 *
 * SAFETY: this ACTIVATES the provider-default and MUST deploy ATOMICALLY with the 2B-1 client-aware
 * engine (an ACTIVE provider-default + the legacy client-blind engine would freeze docs). Prod business
 * tables are empty (zero PR/PO), so the brief migrate-before-swap window carries no exposure.
 * APPROVALS_REQUIRE_WORKFLOW stays OFF by default → auto-approve behavior preserved.
 */
const MODULES = ['PR', 'PO'];
const CANON = 'Provider Default (Auto-Approve)';

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    for (const module of MODULES) {
      const [c] = await q.query(
        `SELECT id FROM approval_workflows WHERE module = ? AND client_id IS NULL AND name = ? LIMIT 1`,
        { replacements: [module, CANON] }
      );
      if (!c.length) continue;                                          // canonical absent — nothing to activate
      const canonId = c[0].id;
      // 2. deactivate competing provider-defaults (client_id NULL, not the canonical)
      await q.query(
        `UPDATE approval_workflows SET status = 'INACTIVE' WHERE module = ? AND client_id IS NULL AND id <> ?`,
        { replacements: [module, canonId] }
      );
      // 3. activate canonical
      await q.query(`UPDATE approval_workflows SET status = 'ACTIVE' WHERE id = ?`, { replacements: [canonId] });
    }
  },
  async down(queryInterface) {
    const q = queryInterface.sequelize;
    // Revert to the pre-2B-1 state: canonical back to INACTIVE. Strays are intentionally NOT resurrected
    // (they were stray/test data; leaving them INACTIVE is the safe state).
    for (const module of MODULES) {
      await q.query(
        `UPDATE approval_workflows SET status = 'INACTIVE' WHERE module = ? AND client_id IS NULL AND name = ?`,
        { replacements: [module, CANON] }
      );
    }
  }
};
