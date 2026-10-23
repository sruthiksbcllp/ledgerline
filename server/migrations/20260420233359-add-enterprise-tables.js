'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // All tables below are also created by the baseline migration (20200101000000).
    // On existing installs they already exist; on fresh installs the baseline runs first.
    // Each createTable is wrapped in try/catch so it silently skips if the table exists.
    // Table names are lowercase to match baseline + model tableName (Linux MySQL is case-sensitive).

    // 1. Vendors
    try {
      await queryInterface.createTable('vendors', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        vendor_name: { type: Sequelize.STRING, allowNull: false },
        vendor_code: { type: Sequelize.STRING, unique: true },
        gst_number: { type: Sequelize.STRING(15) },
        pan_number: { type: Sequelize.STRING(10), unique: true },
        contact_person: { type: Sequelize.STRING },
        email: { type: Sequelize.STRING },
        phone: { type: Sequelize.STRING },
        address: { type: Sequelize.TEXT },
        bank_name: { type: Sequelize.STRING },
        bank_account_no: { type: Sequelize.STRING, unique: true },
        ifsc_code: { type: Sequelize.STRING },
        status: { type: Sequelize.ENUM('DRAFT', 'ACTIVE', 'BLACKLISTED'), defaultValue: 'DRAFT' },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    // 2. Budgets
    try {
      await queryInterface.createTable('budgets', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        financial_year: { type: Sequelize.STRING(10), allowNull: false },
        department_id: { type: Sequelize.INTEGER, references: { model: 'departments', key: 'id' } },
        category_id: { type: Sequelize.INTEGER, references: { model: 'assetcategories', key: 'id' } },
        allocated_amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
        utilized_amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    // 3. Purchase Requisitions (PR)
    try {
      await queryInterface.createTable('purchaserequisitions', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        pr_number: { type: Sequelize.STRING, unique: true },
        requestor_id: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
        property_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'properties', key: 'id' } },
        department_id: { type: Sequelize.INTEGER, references: { model: 'departments', key: 'id' } },
        item_description: { type: Sequelize.TEXT },
        estimated_cost: { type: Sequelize.DECIMAL(15, 2) },
        type: { type: Sequelize.ENUM('CAPEX', 'OPEX'), defaultValue: 'CAPEX' },
        status: { type: Sequelize.ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PO_CREATED'), defaultValue: 'DRAFT' },
        approved_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
        approval_date: { type: Sequelize.DATE },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    // 4. Purchase Orders (PO)
    try {
      await queryInterface.createTable('purchaseorders', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        po_number: { type: Sequelize.STRING, unique: true },
        pr_id: { type: Sequelize.INTEGER, references: { model: 'purchaserequisitions', key: 'id' } },
        property_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'properties', key: 'id' } },
        vendor_id: { type: Sequelize.INTEGER, references: { model: 'vendors', key: 'id' } },
        total_amount: { type: Sequelize.DECIMAL(15, 2) },
        status: { type: Sequelize.ENUM('DRAFT', 'ISSUED', 'PARTIAL_RECEIVED', 'CLOSED', 'CANCELLED'), defaultValue: 'DRAFT' },
        version: { type: Sequelize.INTEGER, defaultValue: 1 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    // 5. GRNs (Goods Receipt Note)
    try {
      await queryInterface.createTable('grns', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        grn_number: { type: Sequelize.STRING, unique: true },
        po_id: { type: Sequelize.INTEGER, references: { model: 'purchaseorders', key: 'id' } },
        property_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'properties', key: 'id' } },
        received_date: { type: Sequelize.DATE },
        received_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
        status: { type: Sequelize.ENUM('RECEIVED', 'REJECTED'), defaultValue: 'RECEIVED' },
        remarks: { type: Sequelize.TEXT },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    // 6. Invoices
    try {
      await queryInterface.createTable('invoices', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        invoice_number: { type: Sequelize.STRING, unique: true },
        po_id: { type: Sequelize.INTEGER, references: { model: 'purchaseorders', key: 'id' } },
        grn_id: { type: Sequelize.INTEGER, references: { model: 'grns', key: 'id' } },
        property_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'properties', key: 'id' } },
        vendor_id: { type: Sequelize.INTEGER, references: { model: 'vendors', key: 'id' } },
        invoice_date: { type: Sequelize.DATE },
        base_amount: { type: Sequelize.DECIMAL(15, 2) },
        gst_amount: { type: Sequelize.DECIMAL(15, 2) },
        total_amount: { type: Sequelize.DECIMAL(15, 2) },
        tds_amount: { type: Sequelize.DECIMAL(15, 2) },
        document_url: { type: Sequelize.STRING(500) },
        status: { type: Sequelize.ENUM('UNPAID', 'PARTIAL', 'PAID'), defaultValue: 'UNPAID' },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    // 7. Audit Schedules
    try {
      await queryInterface.createTable('auditschedules', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: Sequelize.STRING, allowNull: false },
        location_id: { type: Sequelize.INTEGER, references: { model: 'locations', key: 'id' } },
        start_date: { type: Sequelize.DATE },
        end_date: { type: Sequelize.DATE },
        status: { type: Sequelize.ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'), defaultValue: 'SCHEDULED' },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    // 8. Physical Verifications
    try {
      await queryInterface.createTable('physicalverifications', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        audit_id: { type: Sequelize.INTEGER, references: { model: 'auditschedules', key: 'id' } },
        asset_id: { type: Sequelize.INTEGER, references: { model: 'assets', key: 'id' } },
        verified_date: { type: Sequelize.DATE },
        verified_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
        status: { type: Sequelize.ENUM('PRESENT', 'MISSING', 'DAMAGED', 'LOCATION_MISMATCH'), defaultValue: 'PRESENT' },
        remarks: { type: Sequelize.TEXT },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }
  },

  async down (queryInterface, Sequelize) {
    // Drop in reverse dependency order — wrapped in try/catch for safety
    const tables = ['physicalverifications', 'auditschedules', 'invoices', 'grns', 'purchaseorders', 'purchaserequisitions', 'budgets', 'vendors'];
    for (const t of tables) {
      try { await queryInterface.dropTable(t); } catch(e) { /* may not exist */ }
    }
  }
};
