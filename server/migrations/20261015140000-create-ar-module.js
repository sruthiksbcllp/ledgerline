'use strict';

/**
 * Accounts Receivable: customers, customer invoices, receipts (partial/full payments)
 * and overdue reminders. Every table is company-scoped by client_id.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'object' ? t.tableName : t));
    const timestamps = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    };

    if (!tables.includes('ar_customers')) {
      await queryInterface.createTable('ar_customers', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        customer_name: { type: Sequelize.STRING(255), allowNull: false },
        gst_number: { type: Sequelize.STRING(15), allowNull: true },
        email: { type: Sequelize.STRING(255), allowNull: true },
        phone: { type: Sequelize.STRING(50), allowNull: true },
        address: { type: Sequelize.TEXT, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        ...timestamps
      });
      await queryInterface.addIndex('ar_customers', ['client_id', 'customer_name'], { name: 'ar_customers_client_name' });
      await queryInterface.addIndex('ar_customers', ['client_id', 'gst_number'], { unique: true, name: 'ar_customers_client_gstin_unique' });
    }

    if (!tables.includes('ar_invoices')) {
      await queryInterface.createTable('ar_invoices', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        customer_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ar_customers', key: 'id' } },
        invoice_number: { type: Sequelize.STRING(100), allowNull: false },
        invoice_date: { type: Sequelize.DATEONLY, allowNull: false },
        due_date: { type: Sequelize.DATEONLY, allowNull: true },
        customer_po_number: { type: Sequelize.STRING(100), allowNull: true },
        subtotal: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        tax_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        total_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        amount_received: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'), allowNull: false, defaultValue: 'UNPAID' },
        notes: { type: Sequelize.TEXT, allowNull: true },
        source: { type: Sequelize.ENUM('MANUAL', 'AI_EXTRACTED'), allowNull: false, defaultValue: 'MANUAL' },
        source_file_name: { type: Sequelize.STRING(255), allowNull: true },
        last_reminder_at: { type: Sequelize.DATE, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        ...timestamps
      });
      await queryInterface.addIndex('ar_invoices', ['client_id', 'invoice_number'], { unique: true, name: 'ar_invoices_client_number_unique' });
      await queryInterface.addIndex('ar_invoices', ['client_id', 'status', 'due_date'], { name: 'ar_invoices_client_status_due' });
    }

    if (!tables.includes('ar_receipts')) {
      await queryInterface.createTable('ar_receipts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        invoice_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ar_invoices', key: 'id' } },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        received_date: { type: Sequelize.DATEONLY, allowNull: false },
        payment_mode: { type: Sequelize.STRING(30), allowNull: true },
        reference: { type: Sequelize.STRING(100), allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        ...timestamps
      });
      await queryInterface.addIndex('ar_receipts', ['client_id', 'invoice_id'], { name: 'ar_receipts_client_invoice' });
    }

    if (!tables.includes('ar_reminders')) {
      await queryInterface.createTable('ar_reminders', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        invoice_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ar_invoices', key: 'id' } },
        to_email: { type: Sequelize.STRING(255), allowNull: true },
        subject: { type: Sequelize.STRING(255), allowNull: false },
        message: { type: Sequelize.TEXT, allowNull: false },
        delivery: { type: Sequelize.ENUM('EMAILED', 'NOT_SENT'), allowNull: false, defaultValue: 'NOT_SENT' },
        delivery_note: { type: Sequelize.STRING(255), allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        ...timestamps
      });
      await queryInterface.addIndex('ar_reminders', ['client_id', 'invoice_id'], { name: 'ar_reminders_client_invoice' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ar_reminders');
    await queryInterface.dropTable('ar_receipts');
    await queryInterface.dropTable('ar_invoices');
    await queryInterface.dropTable('ar_customers');
  }
};
