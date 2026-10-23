'use strict';

/**
 * CFG-01 — PO Print: per-client print profile + optional per-PO Ship-To.
 * Idempotent (describeTable / showIndex guards) and reversible.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, TEXT, BOOLEAN, DATE } = Sequelize;

    // 1) po_print_config table
    const tables = await queryInterface.showAllTables();
    const has = (t) => tables.map((x) => (x.tableName || x)).map(String).map((s) => s.toLowerCase()).includes(t);
    if (!has('po_print_config')) {
      await queryInterface.createTable('po_print_config', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: INTEGER, allowNull: true },
        entity_id: { type: INTEGER, allowNull: true },
        company_name: { type: STRING(255), allowNull: true },
        registered_address: { type: TEXT, allowNull: true },
        gst_number: { type: STRING(20), allowNull: true },
        pan_number: { type: STRING(15), allowNull: true },
        isd_number: { type: STRING(50), allowNull: true },
        logo_url: { type: STRING(500), allowNull: true },
        terms_conditions: { type: TEXT, allowNull: true },
        default_warranty: { type: STRING(255), allowNull: true },
        default_payment_terms: { type: STRING(255), allowNull: true },
        requested_by_label: { type: STRING(100), allowNull: true, defaultValue: 'Requested by' },
        approved_by_label: { type: STRING(100), allowNull: true, defaultValue: 'PO approved by' },
        footer_note: { type: TEXT, allowNull: true },
        is_active: { type: BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    // unique (client_id, entity_id) — one profile per client+entity
    const idx = await queryInterface.showIndex('po_print_config').catch(() => []);
    if (!idx.some((i) => i.name === 'uk_poprint_client_entity')) {
      await queryInterface.addIndex('po_print_config', ['client_id', 'entity_id'], {
        unique: true, name: 'uk_poprint_client_entity'
      });
    }

    // 2) optional per-PO Ship-To override on purchaseorders
    const poCols = await queryInterface.describeTable('purchaseorders');
    if (!poCols.ship_to_name) {
      await queryInterface.addColumn('purchaseorders', 'ship_to_name', { type: STRING(255), allowNull: true });
    }
    if (!poCols.ship_to_address) {
      await queryInterface.addColumn('purchaseorders', 'ship_to_address', { type: TEXT, allowNull: true });
    }

    // 3) provider-default profile (client_id NULL) — generic fallback so PO print works out of the box
    const [rows] = await queryInterface.sequelize.query(
      "SELECT id FROM po_print_config WHERE client_id IS NULL AND entity_id IS NULL LIMIT 1"
    );
    if (!rows || rows.length === 0) {
      await queryInterface.bulkInsert('po_print_config', [{
        client_id: null, entity_id: null,
        company_name: null, registered_address: null,
        terms_conditions: 'Material should be supplied as per approved specifications. Any discrepancy should be reported immediately. Invoice to be submitted during delivery. It is mandatory to mention the PO number on the tax invoice. The tax invoice must clearly indicate tax components along with any exemption remark, if any. A non-compliant tax invoice may lead to payment rejection.',
        default_warranty: 'Standard OEM Warranty Applicable',
        default_payment_terms: '30 Days Due Net',
        requested_by_label: 'Requested by', approved_by_label: 'PO approved by',
        is_active: true, created_at: new Date(), updated_at: new Date()
      }]);
    }
  },

  async down(queryInterface) {
    const poCols = await queryInterface.describeTable('purchaseorders').catch(() => ({}));
    if (poCols.ship_to_name) await queryInterface.removeColumn('purchaseorders', 'ship_to_name').catch(() => {});
    if (poCols.ship_to_address) await queryInterface.removeColumn('purchaseorders', 'ship_to_address').catch(() => {});
    await queryInterface.dropTable('po_print_config').catch(() => {});
  }
};
