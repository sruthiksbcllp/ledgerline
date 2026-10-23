'use strict';

/**
 * Admin-approved vendor emails for awarded RFQ quotations.
 * - user_mail_accounts: each admin's own SMTP mailbox (password encrypted with MAIL_CREDENTIALS_KEY).
 * - vendor_email_drafts: one draft per awarded quotation (award notice) and per approved PO
 *   (PO confirmation). dedupe_key is unique while a draft is active or sent, so the same
 *   email can never be prepared or sent twice; cancelling releases the key.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'object' ? t.tableName : t));
    const timestamps = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    };

    if (!tables.includes('user_mail_accounts')) {
      await queryInterface.createTable('user_mail_accounts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER, allowNull: false, unique: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        client_id: { type: Sequelize.INTEGER, allowNull: true },
        smtp_host: { type: Sequelize.STRING(255), allowNull: false },
        smtp_port: { type: Sequelize.INTEGER, allowNull: false },
        smtp_secure: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        smtp_user: { type: Sequelize.STRING(255), allowNull: false },
        password_enc: { type: Sequelize.TEXT, allowNull: false },
        from_name: { type: Sequelize.STRING(255), allowNull: true },
        from_email: { type: Sequelize.STRING(255), allowNull: false },
        verified_at: { type: Sequelize.DATE, allowNull: true },
        last_error: { type: Sequelize.STRING(500), allowNull: true },
        ...timestamps
      });
    }

    if (!tables.includes('vendor_email_drafts')) {
      await queryInterface.createTable('vendor_email_drafts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        email_type: { type: Sequelize.ENUM('RFQ_AWARD', 'PO_CONFIRMATION'), allowNull: false },
        rfq_id: { type: Sequelize.INTEGER, allowNull: true },
        quotation_id: { type: Sequelize.INTEGER, allowNull: false },
        vendor_id: { type: Sequelize.INTEGER, allowNull: false },
        po_id: { type: Sequelize.INTEGER, allowNull: true },
        to_email: { type: Sequelize.STRING(255), allowNull: true },
        subject: { type: Sequelize.STRING(255), allowNull: false },
        message: { type: Sequelize.TEXT, allowNull: false },
        details: { type: Sequelize.JSON, allowNull: false },
        attach_po_pdf: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        status: { type: Sequelize.ENUM('DRAFT', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'), allowNull: false, defaultValue: 'DRAFT' },
        dedupe_key: { type: Sequelize.STRING(120), allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        edited_by: { type: Sequelize.INTEGER, allowNull: true },
        edited_at: { type: Sequelize.DATE, allowNull: true },
        approved_by: { type: Sequelize.INTEGER, allowNull: true },
        approved_at: { type: Sequelize.DATE, allowNull: true },
        sent_from: { type: Sequelize.STRING(255), allowNull: true },
        sent_at: { type: Sequelize.DATE, allowNull: true },
        message_id: { type: Sequelize.STRING(255), allowNull: true },
        failure_reason: { type: Sequelize.STRING(500), allowNull: true },
        attempt_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps
      });
      await queryInterface.addIndex('vendor_email_drafts', ['dedupe_key'], { unique: true, name: 'vendor_email_drafts_dedupe_unique' });
      await queryInterface.addIndex('vendor_email_drafts', ['client_id', 'quotation_id'], { name: 'vendor_email_drafts_client_quotation' });
      await queryInterface.addIndex('vendor_email_drafts', ['client_id', 'rfq_id'], { name: 'vendor_email_drafts_client_rfq' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vendor_email_drafts');
    await queryInterface.dropTable('user_mail_accounts');
  }
};
