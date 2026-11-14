'use strict';

/**
 * Bill inbox: vendor bills captured automatically from email.
 *
 * bill_inbox_sources - a user's connected Outlook mailbox that LedgerLine checks for bills
 *                      (every 15 minutes, or when someone clicks "Check now").
 * bill_inbox_items   - one captured attachment: the file, the email it came from, what the AI
 *                      read, how it was sorted (invoice / credit note / statement / other), the
 *                      vendor and PO it matched, and what a person did with it.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    if (!tables.includes('bill_inbox_sources')) {
      await queryInterface.createTable('bill_inbox_sources', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        user_id: { type: Sequelize.INTEGER, allowNull: false }, // whose mailbox
        mailbox_email: { type: Sequelize.STRING(255), allowNull: true },
        mode: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'LIKELY_BILLS' }, // LIKELY_BILLS | ALL_ATTACHMENTS
        enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        checked_until: { type: Sequelize.DATE, allowNull: true }, // mail received up to here has been looked at
        last_checked_at: { type: Sequelize.DATE, allowNull: true },
        last_error: { type: Sequelize.STRING(500), allowNull: true },
        created_at: now,
        updated_at: now
      });
      await queryInterface.addIndex('bill_inbox_sources', ['client_id', 'user_id'], { unique: true, name: 'uq_bill_inbox_source_user' });
    }

    if (!tables.includes('bill_inbox_items')) {
      await queryInterface.createTable('bill_inbox_items', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        source_id: { type: Sequelize.INTEGER, allowNull: true },
        channel: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'EMAIL' },
        // The email
        email_from: { type: Sequelize.STRING(255), allowNull: true },
        email_from_name: { type: Sequelize.STRING(255), allowNull: true },
        email_subject: { type: Sequelize.STRING(500), allowNull: true },
        received_at: { type: Sequelize.DATE, allowNull: true },
        web_link: { type: Sequelize.TEXT, allowNull: true },
        // The file (kept in UPLOAD_DIR / durable storage under storage_key)
        file_name: { type: Sequelize.STRING(255), allowNull: true },
        content_type: { type: Sequelize.STRING(100), allowNull: true },
        file_size: { type: Sequelize.INTEGER, allowNull: true },
        file_hash: { type: Sequelize.STRING(64), allowNull: false },
        storage_key: { type: Sequelize.STRING(300), allowNull: true },
        // What the AI read and how it was sorted
        document_type: { type: Sequelize.STRING(30), allowNull: true }, // INVOICE | CREDIT_NOTE | STATEMENT | PAYMENT_RECEIPT | PURCHASE_ORDER | OTHER
        extraction: { type: Sequelize.JSON, allowNull: true },
        party_name: { type: Sequelize.STRING(255), allowNull: true },
        invoice_number: { type: Sequelize.STRING(100), allowNull: true },
        invoice_date: { type: Sequelize.DATEONLY, allowNull: true },
        total_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
        // Routing
        vendor_id: { type: Sequelize.INTEGER, allowNull: true },
        vendor_matched_by: { type: Sequelize.STRING(20), allowNull: true }, // GSTIN | NAME | EMAIL
        po_id: { type: Sequelize.INTEGER, allowNull: true },
        po_matched_by: { type: Sequelize.STRING(20), allowNull: true }, // NUMBER | ONLY_OPEN_PO
        department_id: { type: Sequelize.INTEGER, allowNull: true },
        requested_by_user_id: { type: Sequelize.INTEGER, allowNull: true },
        duplicate_invoice_id: { type: Sequelize.INTEGER, allowNull: true },
        possible_duplicate_invoice_id: { type: Sequelize.INTEGER, allowNull: true },
        purchase_return_id: { type: Sequelize.INTEGER, allowNull: true }, // credit note: the return waiting for it
        // Review
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'NEW' }, // NEW | FAILED | SET_ASIDE | DUPLICATE | ACCEPTED | DONE | REJECTED
        status_reason: { type: Sequelize.STRING(500), allowNull: true },
        error: { type: Sequelize.STRING(500), allowNull: true },
        invoice_id: { type: Sequelize.INTEGER, allowNull: true },
        reviewed_by: { type: Sequelize.INTEGER, allowNull: true },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        created_at: now,
        updated_at: now
      });
      await queryInterface.addIndex('bill_inbox_items', ['client_id', 'file_hash'], { unique: true, name: 'uq_bill_inbox_item_file' });
      await queryInterface.addIndex('bill_inbox_items', ['client_id', 'status'], { name: 'ix_bill_inbox_item_status' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bill_inbox_items');
    await queryInterface.dropTable('bill_inbox_sources');
  }
};
