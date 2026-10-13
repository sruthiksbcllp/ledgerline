'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 21. Requests
    await queryInterface.createTable('Requests', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      request_type: { type: Sequelize.ENUM('NEW', 'REFILL', 'SPARE_PART', 'REPAIR', 'REPLACEMENT', 'OTHER'), allowNull: false },
      asset_id: { type: Sequelize.INTEGER, references: { model: 'Assets', key: 'id' } },
      request_description: { type: Sequelize.TEXT, allowNull: false },
      manager_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
      request_reason: { type: Sequelize.TEXT },
      current_approval_level: { type: Sequelize.INTEGER, defaultValue: 1 },
      status: { type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED'), defaultValue: 'PENDING' },
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 22. Request Approval Trail
    await queryInterface.createTable('RequestApprovalTrails', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      request_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      approver_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
      approval_level: { type: Sequelize.INTEGER, allowNull: false },
      action: { type: Sequelize.ENUM('APPROVED', 'REJECTED'), allowNull: false },
      remarks: { type: Sequelize.TEXT },
      actioned_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 23. Warranties
    await queryInterface.createTable('Warranties', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Assets', key: 'id' } },
      warranty_code: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      service_provider_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ServiceProviders', key: 'id' } },
      start_date: { type: Sequelize.DATE, allowNull: false },
      end_date: { type: Sequelize.DATE, allowNull: false },
      warranty_type: { type: Sequelize.STRING(100) },
      warranty_terms: { type: Sequelize.TEXT },
      contact_person: { type: Sequelize.STRING(255) },
      contact_phone: { type: Sequelize.STRING(20) },
      remarks: { type: Sequelize.TEXT },
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 24. Asset AMC
    await queryInterface.createTable('AssetAmcs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Assets', key: 'id' } },
      amc_code: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      service_provider_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ServiceProviders', key: 'id' } },
      amc_amount: { type: Sequelize.DECIMAL(12, 2) },
      start_date: { type: Sequelize.DATE, allowNull: false },
      end_date: { type: Sequelize.DATE, allowNull: false },
      amc_type: { type: Sequelize.STRING(100) },
      payment_terms: { type: Sequelize.STRING(255) },
      contact_person: { type: Sequelize.STRING(255) },
      contact_phone: { type: Sequelize.STRING(20) },
      remarks: { type: Sequelize.TEXT },
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 25. Asset Maintenance
    await queryInterface.createTable('AssetMaintenances', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Assets', key: 'id' } },
      maintenance_type_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'MaintenanceTypes', key: 'id' } },
      service_provider_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ServiceProviders', key: 'id' } },
      scheduled_date: { type: Sequelize.DATE, allowNull: false },
      estimated_cost: { type: Sequelize.DECIMAL(12, 2) },
      actual_cost: { type: Sequelize.DECIMAL(12, 2) },
      completion_date: { type: Sequelize.DATE },
      status: { type: Sequelize.ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED'), defaultValue: 'SCHEDULED' },
      description: { type: Sequelize.TEXT },
      remarks: { type: Sequelize.TEXT },
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 26. Audit Plans
    await queryInterface.createTable('AuditPlans', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Assets', key: 'id' } },
      audit_name: { type: Sequelize.STRING(255), allowNull: false },
      auditor_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
      scheduled_date: { type: Sequelize.DATE, allowNull: false },
      completion_date: { type: Sequelize.DATE },
      audit_type: { type: Sequelize.ENUM('PHYSICAL', 'INTERNAL', 'EXTERNAL'), defaultValue: 'PHYSICAL' },
      location_id: { type: Sequelize.INTEGER, references: { model: 'Locations', key: 'id' } },
      department_id: { type: Sequelize.INTEGER, references: { model: 'Departments', key: 'id' } },
      remarks: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'), defaultValue: 'SCHEDULED' },
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 27. Depreciation Ledger
    await queryInterface.createTable('DepreciationLedgers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Assets', key: 'id' } },
      accounting_id: { type: Sequelize.INTEGER, references: { model: 'AssetAccounting', key: 'id' } },
      book_type: { type: Sequelize.ENUM('SLM_COMPANIES_ACT', 'WDV_IT_ACT'), allowNull: false },
      fiscal_year: { type: Sequelize.STRING(9), allowNull: false },
      period_month: { type: Sequelize.INTEGER, allowNull: false },
      opening_value: { type: Sequelize.DECIMAL(15, 2) },
      depreciation_amount: { type: Sequelize.DECIMAL(15, 2) },
      closing_value: { type: Sequelize.DECIMAL(15, 2) },
      accumulated_depreciation: { type: Sequelize.DECIMAL(15, 2) },
      is_prorata: { type: Sequelize.BOOLEAN, defaultValue: false },
      prorata_days: { type: Sequelize.INTEGER },
      year_closed: { type: Sequelize.BOOLEAN, defaultValue: false },
      calculated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      calculated_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    // Add unique constraint for ledger
    await queryInterface.addConstraint('DepreciationLedgers', {
      fields: ['asset_id', 'book_type', 'fiscal_year', 'period_month'],
      type: 'unique',
      name: 'unique_ledger'
    });

    // 28. Activity Logs
    await queryInterface.createTable('ActivityLogs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
      action: { type: Sequelize.STRING(100), allowNull: false },
      module: { type: Sequelize.STRING(100), allowNull: false },
      record_id: { type: Sequelize.INTEGER },
      description: { type: Sequelize.TEXT },
      old_values: { type: Sequelize.JSON },
      new_values: { type: Sequelize.JSON },
      ip_address: { type: Sequelize.STRING(45) },
      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 29. Global Settings
    await queryInterface.createTable('GlobalSettings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      company_name: { type: Sequelize.STRING(255) },
      company_logo: { type: Sequelize.STRING(500) },
      currency_symbol: { type: Sequelize.STRING(5), defaultValue: '₹' },
      date_format: { type: Sequelize.STRING(20), defaultValue: 'DD-MM-YYYY' },
      fy_start_month: { type: Sequelize.INTEGER, defaultValue: 4 },
      default_depreciation_method: { type: Sequelize.ENUM('SLM', 'WDV'), defaultValue: 'SLM' },
      email_notifications: { type: Sequelize.BOOLEAN, defaultValue: true },
      amc_reminder_days: { type: Sequelize.INTEGER, defaultValue: 30 },
      warranty_reminder_days: { type: Sequelize.INTEGER, defaultValue: 30 },
      max_upload_size_mb: { type: Sequelize.INTEGER, defaultValue: 10 },
      session_timeout_minutes: { type: Sequelize.INTEGER, defaultValue: 30 },
      updated_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 30. ID Sequences (Logic helper)
    await queryInterface.createTable('IdSequences', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      prefix: { type: Sequelize.STRING(20), unique: true, allowNull: false },
      last_value: { type: Sequelize.INTEGER, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('IdSequences');
    await queryInterface.dropTable('GlobalSettings');
    await queryInterface.dropTable('ActivityLogs');
    await queryInterface.dropTable('DepreciationLedgers');
    await queryInterface.dropTable('AuditPlans');
    await queryInterface.dropTable('AssetMaintenances');
    await queryInterface.dropTable('AssetAmcs');
    await queryInterface.dropTable('Warranties');
    await queryInterface.dropTable('RequestApprovalTrails');
    await queryInterface.dropTable('Requests');
  }
};
