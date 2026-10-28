'use strict';

/**
 * AP journal engine (Accounts Payable — Journal Entry Reference, and the P2P blueprint's chart of
 * accounts): every AP event posts a balanced journal.
 *   gl_accounts       chart of accounts per company (seeded on first use)
 *   journal_entries   one row per posted event; dedupe_key makes posting idempotent per source event
 *   journal_lines     the debit / credit lines, with the account name as it was when posted
 *
 * Also fixes invoices.itc_eligible: the invoice form never sent the flag, so every manually entered
 * invoice was stored as not eligible for input tax credit (the column default is true).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    };

    if (!tables.includes('gl_accounts')) {
      await queryInterface.createTable('gl_accounts', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        code: { type: Sequelize.STRING(20), allowNull: false },
        name: { type: Sequelize.STRING(150), allowNull: false },
        type: { type: Sequelize.STRING(20), allowNull: false }, // ASSET / LIABILITY / EXPENSE / INCOME / EQUITY
        description: { type: Sequelize.STRING(255), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...ts
      });
      await queryInterface.addIndex('gl_accounts', ['client_id', 'code'], { unique: true, name: 'uq_gl_accounts_client_code' });
    }

    if (!tables.includes('journal_entries')) {
      await queryInterface.createTable('journal_entries', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        je_number: { type: Sequelize.STRING(30), allowNull: true },
        entry_date: { type: Sequelize.DATEONLY, allowNull: false },
        event_type: { type: Sequelize.STRING(30), allowNull: false }, // GOODS_RECEIPT / SERVICE_RECEIPT / INVOICE / PAYMENT / REVERSAL
        source_module: { type: Sequelize.STRING(20), allowNull: false }, // GRN / SES / INVOICE / PAYMENT
        source_id: { type: Sequelize.INTEGER, allowNull: false },
        source_ref: { type: Sequelize.STRING(100), allowNull: true },
        dedupe_key: { type: Sequelize.STRING(80), allowNull: false },
        vendor_id: { type: Sequelize.INTEGER, allowNull: true },
        po_id: { type: Sequelize.INTEGER, allowNull: true },
        invoice_id: { type: Sequelize.INTEGER, allowNull: true },
        narration: { type: Sequelize.STRING(500), allowNull: true },
        total_debit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        total_credit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'POSTED' }, // POSTED / REVERSED
        reversal_of_id: { type: Sequelize.INTEGER, allowNull: true },
        posted_by: { type: Sequelize.INTEGER, allowNull: true },
        posted_by_name: { type: Sequelize.STRING(150), allowNull: true },
        posted_by_role: { type: Sequelize.STRING(100), allowNull: true },
        source: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'AUTO' }, // AUTO / BACKFILL
        ...ts
      });
      await queryInterface.addIndex('journal_entries', ['client_id', 'dedupe_key'], { unique: true, name: 'uq_journal_entries_client_dedupe' });
      await queryInterface.addIndex('journal_entries', ['client_id', 'entry_date'], { name: 'idx_journal_entries_client_date' });
      await queryInterface.addIndex('journal_entries', ['client_id', 'invoice_id'], { name: 'idx_journal_entries_invoice' });
    }

    if (!tables.includes('journal_lines')) {
      await queryInterface.createTable('journal_lines', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        journal_entry_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'journal_entries', key: 'id' }, onDelete: 'CASCADE' },
        line_no: { type: Sequelize.INTEGER, allowNull: false },
        account_code: { type: Sequelize.STRING(20), allowNull: false },
        account_name: { type: Sequelize.STRING(150), allowNull: false },
        debit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        credit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        memo: { type: Sequelize.STRING(255), allowNull: true },
        vendor_id: { type: Sequelize.INTEGER, allowNull: true },
        ...ts
      });
      await queryInterface.addIndex('journal_lines', ['journal_entry_id'], { name: 'idx_journal_lines_entry' });
      await queryInterface.addIndex('journal_lines', ['client_id', 'account_code'], { name: 'idx_journal_lines_account' });
    }

    await queryInterface.sequelize.query('UPDATE invoices SET itc_eligible = 1 WHERE itc_eligible = 0 OR itc_eligible IS NULL');
  },

  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    if (tables.includes('journal_lines')) await queryInterface.dropTable('journal_lines');
    if (tables.includes('journal_entries')) await queryInterface.dropTable('journal_entries');
    if (tables.includes('gl_accounts')) await queryInterface.dropTable('gl_accounts');
  }
};
