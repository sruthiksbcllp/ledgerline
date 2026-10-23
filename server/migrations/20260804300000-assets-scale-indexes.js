'use strict';
/**
 * Scale hardening for large multi-tenant asset tables (large tenants).
 * Additive indexes only — no data change. Idempotent (skips if the index exists).
 *   - ix_assets_tenant_active (client_id, is_active, is_disposed): the FAR list / count / KPI
 *     filter — narrows straight to a tenant's live assets instead of scanning the whole table.
 *   - ix_assets_tenant_code (client_id, asset_code): fast exact / prefix code lookups.
 * NOTE: adding an index to a very large table briefly locks it — run the snapshot-restore
 * dry-run before prod and apply in a low-traffic window.
 */
module.exports = {
  async up(queryInterface) {
    const has = async (name) => {
      try { const idx = await queryInterface.showIndex('assets'); return idx.some((i) => i.name === name); }
      catch (e) { return false; }
    };
    if (!(await has('ix_assets_tenant_active'))) {
      await queryInterface.addIndex('assets', ['client_id', 'is_active', 'is_disposed'], { name: 'ix_assets_tenant_active' });
    }
    if (!(await has('ix_assets_tenant_code'))) {
      await queryInterface.addIndex('assets', ['client_id', 'asset_code'], { name: 'ix_assets_tenant_code' });
    }
  },
  async down(queryInterface) {
    for (const name of ['ix_assets_tenant_active', 'ix_assets_tenant_code']) {
      try { await queryInterface.removeIndex('assets', name); } catch (e) { /* ignore */ }
    }
  },
};
