'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('gate_entries', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      gate_entry_number: { type: Sequelize.STRING, unique: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      property_id: { type: Sequelize.INTEGER, allowNull: false },
      po_id: { type: Sequelize.INTEGER, allowNull: false },
      vendor_id: Sequelize.INTEGER,
      grn_id: Sequelize.INTEGER,
      received_by: Sequelize.INTEGER,
      received_date: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      vehicle_number: Sequelize.STRING(50),
      challan_number: Sequelize.STRING(100),
      qc_status: { type: Sequelize.ENUM('PENDING', 'PASSED', 'FAILED', 'PARTIAL'), defaultValue: 'PENDING' },
      status: { type: Sequelize.ENUM('DRAFT', 'QC_COMPLETED', 'GRN_CREATED', 'CANCELLED'), defaultValue: 'DRAFT' },
      remarks: Sequelize.TEXT,
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    }).catch(() => {});

    await queryInterface.createTable('gate_entry_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      gate_entry_id: { type: Sequelize.INTEGER, allowNull: false },
      po_item_id: { type: Sequelize.INTEGER, allowNull: false },
      item_id: Sequelize.INTEGER,
      item_name: { type: Sequelize.STRING, allowNull: false },
      ordered_quantity: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      received_quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      accepted_quantity: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      rejected_quantity: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      damaged_quantity: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      quality_bucket: { type: Sequelize.ENUM('ACCEPTED', 'REJECTED', 'DAMAGED', 'MIXED'), defaultValue: 'ACCEPTED' },
      qc_status: { type: Sequelize.ENUM('PENDING', 'PASS', 'FAIL', 'PARTIAL'), defaultValue: 'PENDING' },
      qc_remarks: Sequelize.TEXT,
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    }).catch(() => {});

    await queryInterface.createTable('vendor_debit_notes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      debit_note_number: { type: Sequelize.STRING, unique: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      vendor_id: { type: Sequelize.INTEGER, allowNull: false },
      po_id: Sequelize.INTEGER,
      grn_id: Sequelize.INTEGER,
      gate_entry_id: Sequelize.INTEGER,
      invoice_id: Sequelize.INTEGER,
      reason: { type: Sequelize.STRING(255), allowNull: false },
      bucket: { type: Sequelize.ENUM('REJECTED', 'DAMAGED', 'MISMATCH', 'QUALITY'), defaultValue: 'QUALITY' },
      amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      tax_amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      total_amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      status: { type: Sequelize.ENUM('DRAFT', 'APPROVED', 'POSTED', 'CANCELLED'), defaultValue: 'DRAFT' },
      details_json: Sequelize.JSON,
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    }).catch(() => {});

    const grnsTable = await queryInterface.describeTable('grns').catch(() => null);
    if (grnsTable && !grnsTable.gate_entry_id) {
      await queryInterface.sequelize.query('ALTER TABLE grns ADD COLUMN gate_entry_id INT NULL');
    }

    const grnItemsTable = await queryInterface.describeTable('grn_items').catch(() => null);
    if (grnItemsTable && !grnItemsTable.damaged_quantity) {
      await queryInterface.sequelize.query('ALTER TABLE grn_items ADD COLUMN damaged_quantity DECIMAL(10,2) DEFAULT 0');
    }
    if (grnItemsTable && !grnItemsTable.quality_bucket) {
      await queryInterface.sequelize.query("ALTER TABLE grn_items ADD COLUMN quality_bucket ENUM('ACCEPTED','REJECTED','DAMAGED','MIXED') DEFAULT 'ACCEPTED'");
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vendor_debit_notes').catch(() => {});
    await queryInterface.dropTable('gate_entry_items').catch(() => {});
    await queryInterface.dropTable('gate_entries').catch(() => {});
  }
};
