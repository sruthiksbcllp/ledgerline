'use strict';

/**
 * FT-002 Batch 2B-0 — Additive status value: PENDING_CONFIGURATION
 * ----------------------------------------------------------------
 * Adds the ENUM value 'PENDING_CONFIGURATION' to the status column of:
 *   - purchaserequisitions
 *   - purchaseorders
 *   - requests
 *
 * ADDITIVE ONLY. Preserves every existing ENUM value, the NULL/NOT NULL
 * constraint, and the column DEFAULT. NO row is set to the new value here, so
 * there is zero behavior change — the value simply becomes legal for Batch 2B-1.
 *
 * Drift-safe + idempotent: reads the LIVE column definition and only issues an
 * ALTER when the value is missing. Safe to re-run.
 */

const TARGETS = [
  { table: 'purchaserequisitions', column: 'status' },
  { table: 'purchaseorders',       column: 'status' },
  { table: 'requests',             column: 'status' }
];
const NEW_VALUE = 'PENDING_CONFIGURATION';

async function showColumn(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`
  );
  return rows && rows[0] ? rows[0] : null;
}

function nullClause(col) { return col.Null === 'NO' ? 'NOT NULL' : 'NULL'; }
function defaultClause(col) {
  return (col.Default !== null && col.Default !== undefined) ? ` DEFAULT '${col.Default}'` : '';
}

module.exports = {
  async up(queryInterface) {
    for (const { table, column } of TARGETS) {
      try {
        const col = await showColumn(queryInterface, table, column);
        if (!col || !/^enum\(/i.test(col.Type)) continue;          // not an ENUM / column absent
        if (col.Type.includes(`'${NEW_VALUE}'`)) continue;          // already present — idempotent
        const inner = col.Type.slice(col.Type.indexOf('(') + 1, col.Type.lastIndexOf(')'));
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ` +
          `ENUM(${inner}, '${NEW_VALUE}') ${nullClause(col)}${defaultClause(col)}`
        );
      } catch (e) { /* table may not exist in some envs — skip */ }
    }
  },

  async down(queryInterface) {
    // Best-effort: only remove the value if NO row uses it (else no-op — safe).
    for (const { table, column } of TARGETS) {
      try {
        const col = await showColumn(queryInterface, table, column);
        if (!col || !col.Type.includes(`'${NEW_VALUE}'`)) continue;
        const [used] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${column}\` = '${NEW_VALUE}'`
        );
        if (Number(used[0].n) > 0) continue;                        // in use — do not remove
        const inner = col.Type.slice(col.Type.indexOf('(') + 1, col.Type.lastIndexOf(')'))
          .split(',').map(s => s.trim()).filter(v => v !== `'${NEW_VALUE}'`).join(', ');
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ` +
          `ENUM(${inner}) ${nullClause(col)}${defaultClause(col)}`
        );
      } catch (e) { /* skip */ }
    }
  }
};
