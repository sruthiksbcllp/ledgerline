'use strict';

/**
 * Straight-through processing for AI-read bills.
 *
 * ap_auto_submit_settings - per company: auto-submit on/off (off by default), amount limit, how many
 *                           recent clean bills a vendor needs, and how often a clean bill is still
 *                           sent to a person as a spot check.
 * ap_ai_reviews           - one row per AI-read bill that became an invoice: what the AI read, what
 *                           was submitted, and which fields a person corrected. This is the evidence
 *                           for the vendor track record and the accuracy figures.
 * bill_inbox_items        - gains the result of the clean-bill test (auto_check) and whether the bill
 *                           was auto-submitted or picked as a spot check.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    if (!tables.includes('ap_auto_submit_settings')) {
      await queryInterface.createTable('ap_auto_submit_settings', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        max_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 100000 },
        track_record: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
        spot_check_every: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 10 },
        updated_by: { type: Sequelize.INTEGER, allowNull: true },
        created_at: now,
        updated_at: now
      });
      await queryInterface.addIndex('ap_auto_submit_settings', ['client_id'], { unique: true, name: 'uq_ap_auto_submit_client' });
    }

    if (!tables.includes('ap_ai_reviews')) {
      await queryInterface.createTable('ap_ai_reviews', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        vendor_id: { type: Sequelize.INTEGER, allowNull: true },
        invoice_id: { type: Sequelize.INTEGER, allowNull: true },
        bill_inbox_id: { type: Sequelize.INTEGER, allowNull: true },
        channel: { type: Sequelize.STRING(10), allowNull: false }, // EMAIL | UPLOAD
        auto_submitted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        read_values: { type: Sequelize.JSON, allowNull: true },
        submitted_values: { type: Sequelize.JSON, allowNull: true },
        corrected_fields: { type: Sequelize.JSON, allowNull: true },
        created_at: now,
        updated_at: now
      });
      await queryInterface.addIndex('ap_ai_reviews', ['client_id', 'vendor_id', 'id'], { name: 'ix_ap_ai_reviews_vendor' });
    }

    const cols = await queryInterface.describeTable('bill_inbox_items');
    if (!cols.auto_check) await queryInterface.addColumn('bill_inbox_items', 'auto_check', { type: Sequelize.JSON, allowNull: true });
    if (!cols.auto_submitted) await queryInterface.addColumn('bill_inbox_items', 'auto_submitted', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    if (!cols.spot_check) await queryInterface.addColumn('bill_inbox_items', 'spot_check', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('bill_inbox_items');
    if (cols.spot_check) await queryInterface.removeColumn('bill_inbox_items', 'spot_check');
    if (cols.auto_submitted) await queryInterface.removeColumn('bill_inbox_items', 'auto_submitted');
    if (cols.auto_check) await queryInterface.removeColumn('bill_inbox_items', 'auto_check');
    await queryInterface.dropTable('ap_ai_reviews');
    await queryInterface.dropTable('ap_auto_submit_settings');
  }
};
