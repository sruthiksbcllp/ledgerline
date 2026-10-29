'use strict';

/**
 * Purchase returns (return to vendor), recorded against a GRN:
 *   purchase_returns        one row per return; stage BEFORE_INVOICE (GRN not yet invoiced) or
 *                           AFTER_INVOICE (invoice booked; the vendor's credit note is awaited)
 *   purchase_return_items   the GRN lines and quantities sent back, valued at the PO price
 *   invoices.returns_credit value plus GST of after-invoice returns; reduces what the vendor is owed
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    };

    if (!tables.includes('purchase_returns')) {
      await queryInterface.createTable('purchase_returns', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        return_number: { type: Sequelize.STRING(50), allowNull: false },
        grn_id: { type: Sequelize.INTEGER, allowNull: false },
        po_id: { type: Sequelize.INTEGER, allowNull: true },
        vendor_id: { type: Sequelize.INTEGER, allowNull: true },
        invoice_id: { type: Sequelize.INTEGER, allowNull: true },
        stage: { type: Sequelize.STRING(20), allowNull: false }, // BEFORE_INVOICE / AFTER_INVOICE
        return_date: { type: Sequelize.DATEONLY, allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: false },
        total_value: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        gst_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        total_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.STRING(30), allowNull: false }, // RETURNED / AWAITING_CREDIT_NOTE / CREDIT_NOTE_RECEIVED
        credit_note_number: { type: Sequelize.STRING(100), allowNull: true },
        credit_note_date: { type: Sequelize.DATEONLY, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        created_by_name: { type: Sequelize.STRING(150), allowNull: true },
        ...ts
      });
      await queryInterface.addIndex('purchase_returns', ['client_id', 'return_number'], { unique: true, name: 'uq_purchase_returns_number' });
      await queryInterface.addIndex('purchase_returns', ['grn_id'], { name: 'ix_purchase_returns_grn' });
      await queryInterface.addIndex('purchase_returns', ['invoice_id'], { name: 'ix_purchase_returns_invoice' });
    }

    if (!tables.includes('purchase_return_items')) {
      await queryInterface.createTable('purchase_return_items', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        return_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'purchase_returns', key: 'id' }, onDelete: 'CASCADE' },
        grn_item_id: { type: Sequelize.INTEGER, allowNull: false },
        po_item_id: { type: Sequelize.INTEGER, allowNull: true },
        item_name: { type: Sequelize.STRING(255), allowNull: false },
        quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        unit_price: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        ...ts
      });
      await queryInterface.addIndex('purchase_return_items', ['grn_item_id'], { name: 'ix_purchase_return_items_grn_item' });
    }

    const inv = await queryInterface.describeTable('invoices');
    if (!inv.returns_credit) {
      await queryInterface.addColumn('invoices', 'returns_credit', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
    }
  },

  async down(queryInterface) {
    const inv = await queryInterface.describeTable('invoices');
    if (inv.returns_credit) await queryInterface.removeColumn('invoices', 'returns_credit');
    await queryInterface.dropTable('purchase_return_items');
    await queryInterface.dropTable('purchase_returns');
  }
};
