'use strict';

/**
 * FT-002 Batch 2B-1 — extend approval_logs ENUMs for the CONFIGURATION_REQUIRED audit trail.
 *  - action  += 'CONFIGURATION_REQUIRED'
 *  - status  += 'PENDING_CONFIGURATION'
 * ADDITIVE ONLY: preserves every existing value, the NULL/NOT NULL constraint, and the DEFAULT.
 * Drift-safe (reads the live ENUM) + idempotent. Same pattern as the 2B-0 status ENUM migration.
 */
const TARGETS = [
  { table: 'approval_logs', column: 'action', value: 'CONFIGURATION_REQUIRED' },
  { table: 'approval_logs', column: 'status', value: 'PENDING_CONFIGURATION' }
];

async function showColumn(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`);
  return rows && rows[0] ? rows[0] : null;
}
const nullClause = (c) => (c.Null === 'NO' ? 'NOT NULL' : 'NULL');
const defaultClause = (c) => ((c.Default !== null && c.Default !== undefined) ? ` DEFAULT '${c.Default}'` : '');

module.exports = {
  async up(queryInterface) {
    for (const { table, column, value } of TARGETS) {
      try {
        const col = await showColumn(queryInterface, table, column);
        if (!col || !/^enum\(/i.test(col.Type)) continue;
        if (col.Type.includes(`'${value}'`)) continue;                 // idempotent
        const inner = col.Type.slice(col.Type.indexOf('(') + 1, col.Type.lastIndexOf(')'));
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${inner}, '${value}') ${nullClause(col)}${defaultClause(col)}`
        );
      } catch (e) { /* table absent in some envs — skip */ }
    }
  },
  async down(queryInterface) {
    for (const { table, column, value } of TARGETS) {
      try {
        const col = await showColumn(queryInterface, table, column);
        if (!col || !col.Type.includes(`'${value}'`)) continue;
        const [used] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${column}\` = '${value}'`
        );
        if (Number(used[0].n) > 0) continue;                            // in use — do not remove
        const inner = col.Type.slice(col.Type.indexOf('(') + 1, col.Type.lastIndexOf(')'))
          .split(',').map(s => s.trim()).filter(v => v !== `'${value}'`).join(', ');
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${inner}) ${nullClause(col)}${defaultClause(col)}`
        );
      } catch (e) { /* skip */ }
    }
  }
};
