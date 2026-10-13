'use strict';

/**
 * FT-006 — Workflow ownership + uniqueness (schema-integrity / constraint-hardening ONLY).
 * Scope approved 2026-06-14 (FT-006-Impact-Analysis-and-Change-Record.md §10). MySQL 8.4.8 (prod).
 *
 * Makes the 2B-1 resolver invariant ("at most one ACTIVE workflow per (module, client_id)")
 * DB-enforced instead of runtime-enforced. NO engine / resolution / business-rule / Decision-A /
 * provider-default / 2B-1 changes. Idempotent + reversible. Logs counts for the evidence pack.
 *
 * Order (each data fix precedes the constraint that depends on it):
 *   A deactivate duplicate ACTIVE workflows per (module, client_id), keep highest-id canonical
 *     (provider-default name preferred within client_id NULL groups)
 *   B delete orphan approval_matrix rows (no parent workflow)
 *   C dedupe non-null (workflow_id, level, role_code) matrix rows, keep highest id
 *     (NULL role_code rows are left intact — NULLs are distinct in a MySQL unique index)
 *   D backfill approval_matrix.client_id = parent workflow.client_id (NULL-safe)
 *   E add STORED generated column active_uk + UNIQUE uk_workflow_active_scope
 *   F add UNIQUE uk_matrix_workflow_level_role (workflow_id, level, role_code)
 *   G add FK fk_matrix_workflow (approval_matrix.workflow_id -> approval_workflows.id) ON DELETE CASCADE
 */

const PROVIDER_CANON = 'Provider Default (Auto-Approve)';

async function scalar(q, sql) {
  const [rows] = await q.query(sql);
  const r = rows && rows[0] ? rows[0] : {};
  return Number(r[Object.keys(r)[0]] || 0);
}
async function columnExists(q, table, col) {
  return (await scalar(q,
    `SELECT COUNT(*) n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND COLUMN_NAME='${col}'`)) > 0;
}
async function indexExists(q, table, name) {
  return (await scalar(q,
    `SELECT COUNT(*) n FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND INDEX_NAME='${name}'`)) > 0;
}
async function constraintExists(q, table, name) {
  return (await scalar(q,
    `SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND CONSTRAINT_NAME='${name}'`)) > 0;
}
async function tableExists(q, table) {
  return (await scalar(q,
    `SELECT COUNT(*) n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}'`)) > 0;
}

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    if (!(await tableExists(q, 'approval_workflows')) || !(await tableExists(q, 'approval_matrix'))) {
      console.log('[FT-006] approval tables absent — skipping (fresh env will create them compliant).');
      return;
    }

    // ── A. dedupe duplicate ACTIVE workflows per (module, client_id) ──────────────
    const dupWf = await scalar(q,
      `SELECT COUNT(*) n FROM (
         SELECT id, ROW_NUMBER() OVER (
                  PARTITION BY module, IFNULL(client_id, -1)
                  ORDER BY (name = '${PROVIDER_CANON}') DESC, id DESC) rn
         FROM approval_workflows WHERE status='ACTIVE' AND module IS NOT NULL
       ) t WHERE t.rn > 1`);
    if (dupWf > 0) {
      await q.query(
        `UPDATE approval_workflows w
           JOIN (SELECT id, ROW_NUMBER() OVER (
                          PARTITION BY module, IFNULL(client_id, -1)
                          ORDER BY (name = '${PROVIDER_CANON}') DESC, id DESC) rn
                 FROM approval_workflows WHERE status='ACTIVE' AND module IS NOT NULL) d
             ON d.id = w.id
            SET w.status='INACTIVE'
          WHERE d.rn > 1`);
    }
    console.log(`[FT-006][A] duplicate ACTIVE workflows deactivated: ${dupWf}`);

    // ── B. delete orphan matrix rows ─────────────────────────────────────────────
    const orphans = await scalar(q,
      `SELECT COUNT(*) n FROM approval_matrix m
         LEFT JOIN approval_workflows w ON w.id = m.workflow_id
        WHERE w.id IS NULL`);
    if (orphans > 0) {
      await q.query(
        `DELETE m FROM approval_matrix m
           LEFT JOIN approval_workflows w ON w.id = m.workflow_id
          WHERE w.id IS NULL`);
    }
    console.log(`[FT-006][B] orphan matrix rows deleted: ${orphans}`);

    // ── C. dedupe non-null (workflow_id, level, role_code) matrix rows ───────────
    const dupMx = await scalar(q,
      `SELECT COUNT(*) n FROM (
         SELECT id, ROW_NUMBER() OVER (
                  PARTITION BY workflow_id, level, role_code ORDER BY id DESC) rn
         FROM approval_matrix WHERE role_code IS NOT NULL
       ) t WHERE t.rn > 1`);
    if (dupMx > 0) {
      await q.query(
        `DELETE m FROM approval_matrix m
           JOIN (SELECT id, ROW_NUMBER() OVER (
                          PARTITION BY workflow_id, level, role_code ORDER BY id DESC) rn
                 FROM approval_matrix WHERE role_code IS NOT NULL) d
             ON d.id = m.id
          WHERE d.rn > 1`);
    }
    console.log(`[FT-006][C] duplicate non-null matrix rows deleted: ${dupMx}`);

    // ── D. backfill matrix.client_id = parent workflow.client_id (NULL-safe) ─────
    const misaligned = await scalar(q,
      `SELECT COUNT(*) n FROM approval_matrix m
         JOIN approval_workflows w ON w.id = m.workflow_id
        WHERE NOT (m.client_id <=> w.client_id)`);
    if (misaligned > 0) {
      await q.query(
        `UPDATE approval_matrix m
           JOIN approval_workflows w ON w.id = m.workflow_id
            SET m.client_id = w.client_id
          WHERE NOT (m.client_id <=> w.client_id)`);
    }
    console.log(`[FT-006][D] matrix rows aligned to workflow client_id: ${misaligned}`);

    // ── E. workflow uniqueness: generated column + unique index ──────────────────
    if (!(await columnExists(q, 'approval_workflows', 'active_uk'))) {
      await q.query(
        "ALTER TABLE `approval_workflows` ADD COLUMN `active_uk` VARCHAR(160) " +
        "GENERATED ALWAYS AS (CASE WHEN `status`='ACTIVE' " +
        "THEN CONCAT(`module`, ':', IFNULL(CAST(`client_id` AS CHAR), 'PROVIDER')) ELSE NULL END) STORED");
    }
    if (!(await indexExists(q, 'approval_workflows', 'uk_workflow_active_scope'))) {
      await q.query("CREATE UNIQUE INDEX `uk_workflow_active_scope` ON `approval_workflows` (`active_uk`)");
    }
    console.log('[FT-006][E] uk_workflow_active_scope ensured');

    // ── F. matrix uniqueness ─────────────────────────────────────────────────────
    if (!(await indexExists(q, 'approval_matrix', 'uk_matrix_workflow_level_role'))) {
      await q.query(
        "CREATE UNIQUE INDEX `uk_matrix_workflow_level_role` ON `approval_matrix` (`workflow_id`,`level`,`role_code`)");
    }
    console.log('[FT-006][F] uk_matrix_workflow_level_role ensured');

    // ── G. FK matrix -> workflow (cascade) ───────────────────────────────────────
    if (!(await constraintExists(q, 'approval_matrix', 'fk_matrix_workflow'))) {
      await q.query(
        "ALTER TABLE `approval_matrix` ADD CONSTRAINT `fk_matrix_workflow` " +
        "FOREIGN KEY (`workflow_id`) REFERENCES `approval_workflows`(`id`) ON DELETE CASCADE");
    }
    console.log('[FT-006][G] fk_matrix_workflow ensured');
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    // Reverse DDL only. Step A deactivations and Step D client_id alignment are NOT reverted
    // (safe state, consistent with 2B-1 reconcile — reverting would reintroduce drift).
    if (await constraintExists(q, 'approval_matrix', 'fk_matrix_workflow')) {
      await q.query("ALTER TABLE `approval_matrix` DROP FOREIGN KEY `fk_matrix_workflow`");
    }
    if (await indexExists(q, 'approval_matrix', 'uk_matrix_workflow_level_role')) {
      await q.query("DROP INDEX `uk_matrix_workflow_level_role` ON `approval_matrix`");
    }
    if (await indexExists(q, 'approval_workflows', 'uk_workflow_active_scope')) {
      await q.query("DROP INDEX `uk_workflow_active_scope` ON `approval_workflows`");
    }
    if (await columnExists(q, 'approval_workflows', 'active_uk')) {
      await q.query("ALTER TABLE `approval_workflows` DROP COLUMN `active_uk`");
    }
  }
};
