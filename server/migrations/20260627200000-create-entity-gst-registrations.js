'use strict';
/**
 * Phase B — entity_gst_registrations (entity x state GSTIN registry).
 * Additive, idempotent, reversible. No DB-level FK (matches house pattern).
 *
 * Design notes (driven by real the client data, 39 regs / 9 entities):
 *  - GSTIN is the natural unique key (globally unique). An entity can hold
 *    MULTIPLE GSTINs in the SAME state (e.g. a Regular + an Input Service
 *    Distributor + an SEZ unit), so (entity_id, state_code) is intentionally
 *    NOT unique.
 *  - state_code is the canonical 2-digit GST state code (GSTIN[0:2]); state_name
 *    is a free label (source text is inconsistent, e.g. "TELAGANA").
 *  - taxpayer_type (REGULAR/SEZ/ISD/COMPOSITION/...) + status (ACTIVE/SURRENDERED)
 *    let the Phase C place-of-supply resolver pick the REGULAR + ACTIVE GSTIN.
 *  - client_id scopes the registry per tenant (multi-tenant isolation).
 */
module.exports = {
  async up(q, S) {
    const tables = await q.showAllTables();
    const has = tables.map((t) => (typeof t === 'string' ? t : t.tableName)).includes('entity_gst_registrations');
    if (!has) {
      await q.createTable('entity_gst_registrations', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: S.INTEGER, allowNull: false },
        entity_id: { type: S.INTEGER, allowNull: false },
        gstin: { type: S.STRING(15), allowNull: false },
        state_code: { type: S.STRING(2), allowNull: true },
        state_name: { type: S.STRING(60), allowNull: true },
        pan: { type: S.STRING(10), allowNull: true },
        taxpayer_type: { type: S.STRING(40), allowNull: true },
        reg_date: { type: S.DATEONLY, allowNull: true },
        status: { type: S.STRING(20), allowNull: true },
        is_active: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') }
      });
    }
    const idx = await q.showIndex('entity_gst_registrations').catch(() => []);
    const names = (idx || []).map((i) => i.name);
    if (!names.includes('uk_entity_gst_gstin')) {
      await q.addIndex('entity_gst_registrations', ['gstin'], { unique: true, name: 'uk_entity_gst_gstin' });
    }
    if (!names.includes('ix_entity_gst_lookup')) {
      await q.addIndex('entity_gst_registrations', ['client_id', 'entity_id', 'state_code'], { name: 'ix_entity_gst_lookup' });
    }
  },
  async down(q) {
    const tables = await q.showAllTables();
    const has = tables.map((t) => (typeof t === 'string' ? t : t.tableName)).includes('entity_gst_registrations');
    if (has) await q.dropTable('entity_gst_registrations');
  }
};
