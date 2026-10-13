'use strict';
/**
 * Tenant-isolation Batch B2 (defense-in-depth): add a nullable client_id to 9 child tables
 * that lacked one, and backfill each from its parent (asset / issue / project / disposal /
 * audit session). ADDITIVE + NULLABLE only — never NOT NULL, unique, or a new FK, so no
 * insert path can fail and there is no dedup risk. New rows stamp client_id on create; READS
 * are left untouched (Batch A already scopes them via parent joins). Idempotent + reversible.
 * FINANCIAL/OPERATIONAL tables + backfill -> mandatory snapshot-restore dry-run before prod.
 */
const TABLES = [
  'asset_movements',
  'assetdisposals',
  'assetmaintenances',
  'assetissuecomments',
  'cwip_milestones',
  'cwip_project_assets',
  'disposal_bids',
  'audit_assets',
  'audit_scans',
];

module.exports = {
  async up(q, S) {
    for (const t of TABLES) {
      const d = await q.describeTable(t).catch(() => ({}));
      if (!d.client_id) {
        await q.addColumn(t, 'client_id', { type: S.INTEGER, allowNull: true });
      }
    }
    // Backfills (each fills only NULLs -> idempotent).
    const q_ = q.sequelize.query.bind(q.sequelize);
    await q_('UPDATE asset_movements t JOIN assets a ON t.asset_id=a.id SET t.client_id=a.client_id WHERE t.client_id IS NULL AND a.client_id IS NOT NULL;');
    await q_('UPDATE assetdisposals t JOIN assets a ON t.asset_id=a.id SET t.client_id=a.client_id WHERE t.client_id IS NULL AND a.client_id IS NOT NULL;');
    await q_('UPDATE assetmaintenances t JOIN assets a ON t.asset_id=a.id SET t.client_id=a.client_id WHERE t.client_id IS NULL AND a.client_id IS NOT NULL;');
    await q_('UPDATE assetissuecomments t JOIN assetissues p ON t.issue_id=p.id SET t.client_id=p.client_id WHERE t.client_id IS NULL AND p.client_id IS NOT NULL;');
    await q_('UPDATE cwip_milestones t JOIN cwip_projects p ON t.project_id=p.id SET t.client_id=p.client_id WHERE t.client_id IS NULL AND p.client_id IS NOT NULL;');
    await q_('UPDATE cwip_project_assets t JOIN cwip_projects p ON t.project_id=p.id SET t.client_id=p.client_id WHERE t.client_id IS NULL AND p.client_id IS NOT NULL;');
    await q_('UPDATE disposal_bids t JOIN assetdisposals d ON t.disposal_id=d.id JOIN assets a ON d.asset_id=a.id SET t.client_id=a.client_id WHERE t.client_id IS NULL AND a.client_id IS NOT NULL;');
    await q_('UPDATE audit_assets t JOIN audit_sessions s ON t.audit_session_id=s.id SET t.client_id=s.client_id WHERE t.client_id IS NULL AND s.client_id IS NOT NULL;');
    await q_('UPDATE audit_scans t JOIN audit_sessions s ON t.audit_session_id=s.id SET t.client_id=s.client_id WHERE t.client_id IS NULL AND s.client_id IS NOT NULL;');
  },

  async down(q) {
    for (const t of TABLES) {
      const d = await q.describeTable(t).catch(() => ({}));
      if (d.client_id) await q.removeColumn(t, 'client_id');
    }
  },
};
