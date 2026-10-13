'use strict';
/**
 * Data-integrity: AssetAccounting is 1:1 with Asset (Asset.hasOne), but the create/update
 * upsert was NOT keyed on asset_id, so repeated manual saves inserted DUPLICATE rows for the
 * same asset. Those duplicates fan out every LEFT JOIN to assetaccounting -> inflated FAR PDF
 * rows, wrong FAR "method" column, and over-counted KPI cards.
 *
 * up(): (a) REPOINT any depreciationledgers.accounting_id that references a soon-to-be-deleted
 * duplicate row onto the KEPT (MAX id) accounting row for that asset (avoids the FK constraint
 * depreciationledgers_ibfk_2); (b) DEDUPE — keep the latest (MAX id) per asset_id, delete the
 * rest; (c) add a UNIQUE index on asset_id so upsert becomes insert-or-update and dups can't recur.
 * Idempotent + reversible. FINANCIAL TABLE + DELETE -> mandatory snapshot-restore dry-run before prod.
 */
module.exports = {
  async up(q) {
    // (a) Repoint child depreciationledgers rows off the duplicate accounting rows onto the keeper.
    await q.sequelize.query(
      'UPDATE depreciationledgers led ' +
      'INNER JOIN assetaccounting aa ON led.accounting_id = aa.id ' +
      'INNER JOIN (SELECT asset_id, MAX(id) AS keep_id FROM assetaccounting GROUP BY asset_id) k ' +
      '  ON k.asset_id = aa.asset_id ' +
      'SET led.accounting_id = k.keep_id ' +
      'WHERE led.accounting_id <> k.keep_id;'
    );

    // (b) Dedupe: delete every accounting row that is NOT the highest id for its asset_id.
    await q.sequelize.query(
      'DELETE aa FROM assetaccounting aa ' +
      'INNER JOIN (SELECT asset_id, MAX(id) AS keep_id FROM assetaccounting GROUP BY asset_id) k ' +
      '  ON aa.asset_id = k.asset_id AND aa.id < k.keep_id;'
    );

    // (c) Add the UNIQUE index on asset_id (guarded — idempotent).
    const idx = await q.showIndex('assetaccounting').catch(() => []);
    const names = (idx || []).map((i) => i.name);
    if (!names.includes('uk_assetaccounting_asset_id')) {
      await q.addIndex('assetaccounting', ['asset_id'], { unique: true, name: 'uk_assetaccounting_asset_id' });
    }
  },

  async down(q) {
    const idx = await q.showIndex('assetaccounting').catch(() => []);
    const names = (idx || []).map((i) => i.name);
    if (names.includes('uk_assetaccounting_asset_id')) {
      await q.removeIndex('assetaccounting', 'uk_assetaccounting_asset_id');
    }
  }
};
