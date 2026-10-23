'use strict';

/**
 * AP invoice automation:
 * - invoices gain due date, paid amount (partial payments), approval/rejection trail and source.
 * - REJECTED status (Pending=UNPAID, Approved=APPROVED_FOR_PAYMENT, Partially Paid=PARTIAL, Paid=PAID).
 * - invoice_number is unique per company + vendor, not across every company.
 * - ap_invoice_lines (extracted line items) and ap_payments (payment history).
 */
const STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'EXCEPTION', 'APPROVED_FOR_PAYMENT', 'WAITING_FOR_PAYMENT', 'REJECTED'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('invoices');
    const add = async (name, def) => { if (!cols[name]) await queryInterface.addColumn('invoices', name, def); };
    await add('due_date', { type: Sequelize.DATEONLY, allowNull: true });
    await add('paid_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
    await add('source', { type: Sequelize.ENUM('MANUAL', 'AI_EXTRACTED'), allowNull: false, defaultValue: 'MANUAL' });
    await add('approved_by', { type: Sequelize.INTEGER, allowNull: true });
    await add('approved_at', { type: Sequelize.DATE, allowNull: true });
    await add('rejected_by', { type: Sequelize.INTEGER, allowNull: true });
    await add('rejected_at', { type: Sequelize.DATE, allowNull: true });
    await add('rejection_reason', { type: Sequelize.TEXT, allowNull: true });

    await queryInterface.changeColumn('invoices', 'status', {
      type: Sequelize.ENUM(...STATUSES), allowNull: false, defaultValue: 'UNPAID'
    });

    const indexes = await queryInterface.showIndex('invoices');
    const globalUnique = indexes.find((idx) => idx.unique && idx.fields.length === 1 && idx.fields[0].attribute === 'invoice_number');
    if (globalUnique) await queryInterface.removeIndex('invoices', globalUnique.name);
    if (!indexes.some((idx) => idx.name === 'invoices_client_vendor_number_unique')) {
      await queryInterface.addIndex('invoices', ['client_id', 'vendor_id', 'invoice_number'], {
        unique: true, name: 'invoices_client_vendor_number_unique'
      });
    }

    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'object' ? t.tableName : t));
    const timestamps = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    };
    if (!tables.includes('ap_invoice_lines')) {
      await queryInterface.createTable('ap_invoice_lines', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        invoice_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'invoices', key: 'id' }, onDelete: 'CASCADE' },
        line_no: { type: Sequelize.INTEGER, allowNull: false },
        description: { type: Sequelize.STRING(500), allowNull: false },
        quantity: { type: Sequelize.DECIMAL(15, 3), allowNull: true },
        unit_price: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        tax_rate_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
        ...timestamps
      });
      await queryInterface.addIndex('ap_invoice_lines', ['invoice_id'], { name: 'ap_invoice_lines_invoice' });
    }
    if (!tables.includes('ap_payments')) {
      await queryInterface.createTable('ap_payments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        invoice_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'invoices', key: 'id' } },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        payment_date: { type: Sequelize.DATEONLY, allowNull: false },
        payment_mode: { type: Sequelize.STRING(30), allowNull: true },
        reference: { type: Sequelize.STRING(100), allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        ...timestamps
      });
      await queryInterface.addIndex('ap_payments', ['client_id', 'invoice_id'], { name: 'ap_payments_client_invoice' });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('ap_payments');
    await queryInterface.dropTable('ap_invoice_lines');
    // invoice columns and the per-company unique index are kept: invoices may already depend on them.
    await queryInterface.changeColumn('invoices', 'status', {
      type: Sequelize.ENUM(...STATUSES.filter((s) => s !== 'REJECTED')), allowNull: false, defaultValue: 'UNPAID'
    });
  }
};
