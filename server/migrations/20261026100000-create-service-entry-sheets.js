'use strict';

/**
 * Service Entry Sheet (SES): the service-procurement counterpart of the GRN (FDS section 8).
 * Workflow: Service Performed (recorded) -> Service Confirmation -> Manager Review -> SES Approval.
 * An approved SES is the receipt document for 3-way matching of service invoices
 * (invoices.ses_id / three_way_matches.ses_id), in place of a GRN.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => String(t.tableName || t).toLowerCase());
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    if (!tables.includes('service_entry_sheets')) {
      await queryInterface.createTable('service_entry_sheets', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        ses_number: { type: Sequelize.STRING(60), allowNull: false },
        po_id: { type: Sequelize.INTEGER, allowNull: false },
        vendor_id: { type: Sequelize.INTEGER, allowNull: true },
        entity_id: { type: Sequelize.INTEGER, allowNull: true },
        property_id: { type: Sequelize.INTEGER, allowNull: true },
        location_id: { type: Sequelize.INTEGER, allowNull: true },
        service_period_from: { type: Sequelize.DATEONLY, allowNull: false },
        service_period_to: { type: Sequelize.DATEONLY, allowNull: false },
        service_description: { type: Sequelize.TEXT, allowNull: false },
        performed_by: { type: Sequelize.STRING(150), allowNull: true },
        invoice_number: { type: Sequelize.STRING(100), allowNull: true },
        total_value: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        status: {
          type: Sequelize.ENUM('PENDING_CONFIRMATION', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'),
          allowNull: false,
          defaultValue: 'PENDING_CONFIRMATION'
        },
        created_by: { type: Sequelize.INTEGER, allowNull: false },
        confirmed_by: { type: Sequelize.INTEGER, allowNull: true },
        confirmed_at: { type: Sequelize.DATE, allowNull: true },
        confirmation_remarks: { type: Sequelize.TEXT, allowNull: true },
        reviewed_by: { type: Sequelize.INTEGER, allowNull: true },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        review_remarks: { type: Sequelize.TEXT, allowNull: true },
        approved_by: { type: Sequelize.INTEGER, allowNull: true },
        approved_at: { type: Sequelize.DATE, allowNull: true },
        approval_remarks: { type: Sequelize.TEXT, allowNull: true },
        rejected_by: { type: Sequelize.INTEGER, allowNull: true },
        rejected_at: { type: Sequelize.DATE, allowNull: true },
        rejected_stage: { type: Sequelize.STRING(30), allowNull: true },
        rejection_reason: { type: Sequelize.TEXT, allowNull: true },
        created_at: now,
        updated_at: now
      });
      await queryInterface.addIndex('service_entry_sheets', ['client_id', 'ses_number'], { unique: true, name: 'ses_client_number_unique' });
      await queryInterface.addIndex('service_entry_sheets', ['client_id', 'status'], { name: 'ses_client_status' });
      await queryInterface.addIndex('service_entry_sheets', ['po_id'], { name: 'ses_po' });
    }

    if (!tables.includes('service_entry_sheet_items')) {
      await queryInterface.createTable('service_entry_sheet_items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        ses_id: { type: Sequelize.INTEGER, allowNull: false },
        po_item_id: { type: Sequelize.INTEGER, allowNull: false },
        item_name: { type: Sequelize.STRING(255), allowNull: false },
        ordered_quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        unit_price: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        remarks: { type: Sequelize.TEXT, allowNull: true },
        created_at: now,
        updated_at: now
      });
      await queryInterface.addIndex('service_entry_sheet_items', ['ses_id'], { name: 'ses_items_ses' });
      await queryInterface.addIndex('service_entry_sheet_items', ['po_item_id'], { name: 'ses_items_po_item' });
    }

    const invoiceCols = await queryInterface.describeTable('invoices');
    if (!invoiceCols.ses_id) {
      await queryInterface.addColumn('invoices', 'ses_id', { type: Sequelize.INTEGER, allowNull: true });
      await queryInterface.addIndex('invoices', ['ses_id'], { name: 'invoices_ses' });
    }
    const matchCols = await queryInterface.describeTable('three_way_matches');
    if (!matchCols.ses_id) {
      await queryInterface.addColumn('three_way_matches', 'ses_id', { type: Sequelize.INTEGER, allowNull: true });
    }

    // Let SES numbers be configured in Document Numbering like the other documents.
    const numCols = await queryInterface.describeTable('document_numbering_config');
    const docType = numCols.document_type;
    if (docType && /^enum\(/i.test(docType.type) && !/'SES'/i.test(docType.type)) {
      const values = [...docType.type.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      await queryInterface.changeColumn('document_numbering_config', 'document_type', {
        type: Sequelize.ENUM(...values, 'SES'),
        allowNull: docType.allowNull
      });
    }
  },

  async down(queryInterface) {
    const matchCols = await queryInterface.describeTable('three_way_matches');
    if (matchCols.ses_id) await queryInterface.removeColumn('three_way_matches', 'ses_id');
    const invoiceCols = await queryInterface.describeTable('invoices');
    if (invoiceCols.ses_id) {
      await queryInterface.removeIndex('invoices', 'invoices_ses').catch(() => {});
      await queryInterface.removeColumn('invoices', 'ses_id');
    }
    await queryInterface.dropTable('service_entry_sheet_items');
    await queryInterface.dropTable('service_entry_sheets');
  }
};
