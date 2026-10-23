'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Create companies table
    await queryInterface.createTable('companies', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      company_code: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      company_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      company_type: {
        type: Sequelize.ENUM('PARTNERSHIP', 'LIMITED_LIABILITY', 'SOLE_PROPRIETOR', 'CORPORATION'),
        defaultValue: 'LIMITED_LIABILITY',
      },
      registration_number: Sequelize.STRING(100),
      tax_identification_number: Sequelize.STRING(100),
      gst_registration_number: Sequelize.STRING(50),
      address_line_1: Sequelize.STRING(255),
      address_line_2: Sequelize.STRING(255),
      city: Sequelize.STRING(100),
      state: Sequelize.STRING(100),
      postal_code: Sequelize.STRING(20),
      country: {
        type: Sequelize.STRING(100),
        defaultValue: 'India',
      },
      email: Sequelize.STRING(255),
      phone: Sequelize.STRING(20),
      reporting_currency: {
        type: Sequelize.ENUM('INR', 'USD', 'EUR', 'GBP'),
        defaultValue: 'INR',
      },
      financial_year_start_month: {
        type: Sequelize.INTEGER,
        defaultValue: 4,
      },
      depreciation_method_default: {
        type: Sequelize.ENUM('SLM', 'WDV', 'DECLINING_BALANCE'),
        defaultValue: 'SLM',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      created_by: Sequelize.STRING(100),
      updated_by: Sequelize.STRING(100),
    });

    await queryInterface.addIndex('companies', ['client_id']);
    await queryInterface.addIndex('companies', ['company_code']);
    await queryInterface.addIndex('companies', ['is_active']);

    // Step 2: Create user_company_assignments table
    await queryInterface.createTable('user_company_assignments', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      company_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      access_level: {
        type: Sequelize.ENUM('VIEW_ONLY', 'EDIT', 'ADMIN'),
        defaultValue: 'EDIT',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('user_company_assignments', ['user_id']);
    await queryInterface.addIndex('user_company_assignments', ['company_id']);
    await queryInterface.addIndex('user_company_assignments', ['client_id']);
    await queryInterface.addIndex('user_company_assignments', ['user_id', 'company_id'], { unique: true });

    // Step 3: Create company_policies table
    await queryInterface.createTable('company_policies', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      company_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      min_cost_to_capitalize: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 5000.00,
      },
      allow_override_by_cost_center: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      depreciation_method_primary: {
        type: Sequelize.ENUM('SLM', 'WDV', 'DECLINING_BALANCE'),
        defaultValue: 'SLM',
      },
      depreciation_method_secondary: {
        type: Sequelize.ENUM('SLM', 'WDV', 'DECLINING_BALANCE', 'NONE'),
        defaultValue: 'WDV',
      },
      allow_custom_useful_life: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      allow_residual_value_override: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      approval_required_above: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 100000.00,
      },
      multi_level_approval_above: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 500000.00,
      },
      allow_inter_company_transfer: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      transfer_requires_approval: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      transfer_approval_days: {
        type: Sequelize.INTEGER,
        defaultValue: 5,
      },
      consolidated_report_visibility: {
        type: Sequelize.ENUM('COMPANY_ONLY', 'GROUP', 'SUPER_ADMIN'),
        defaultValue: 'COMPANY_ONLY',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('company_policies', ['client_id']);
    await queryInterface.addIndex('company_policies', ['company_id']);

    // Step 4: Add company_id column to assets table (nullable for backward compatibility)
    await queryInterface.addColumn('assets', 'company_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addIndex('assets', ['company_id']);

    // Step 5: Add company_id column to depreciationledgers table (nullable for backward compatibility)
    await queryInterface.addColumn('depreciationledgers', 'company_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addIndex('depreciationledgers', ['company_id']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove columns added to existing tables
    await queryInterface.removeColumn('depreciationledgers', 'company_id');
    await queryInterface.removeColumn('assets', 'company_id');

    // Drop new tables
    await queryInterface.dropTable('company_policies');
    await queryInterface.dropTable('user_company_assignments');
    await queryInterface.dropTable('companies');
  }
};
