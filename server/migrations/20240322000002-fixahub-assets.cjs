'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 16. Assets
    await queryInterface.createTable('Assets', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_name: { type: Sequelize.STRING, allowNull: false },
      asset_code: { type: Sequelize.STRING, unique: true, allowNull: false },
      asset_description: { type: Sequelize.TEXT },
      property_id: { type: Sequelize.INTEGER, references: { model: 'Properties', key: 'id' } },
      asset_type: { type: Sequelize.ENUM('OWNED', 'LEASED', 'RENTED', 'HIRED'), defaultValue: 'OWNED' },
      category_id: { type: Sequelize.INTEGER, references: { model: 'AssetCategories', key: 'id' } },
      sub_category_id: { type: Sequelize.INTEGER, references: { model: 'AssetSubCategories', key: 'id' } },
      department_id: { type: Sequelize.INTEGER, references: { model: 'Departments', key: 'id' } },
      sub_department_id: { type: Sequelize.INTEGER, references: { model: 'SubDepartments', key: 'id' } },
      region_id: { type: Sequelize.INTEGER, references: { model: 'Regions', key: 'id' } },
      location_id: { type: Sequelize.INTEGER, references: { model: 'Locations', key: 'id' } },
      total_price: { type: Sequelize.DECIMAL(15, 2) },
      purchase_date: { type: Sequelize.DATE },
      asset_image: { type: Sequelize.STRING(500) },
      asset_document: { type: Sequelize.STRING(500) },
      vendor_supplier: { type: Sequelize.STRING(255) },
      invoice_number: { type: Sequelize.STRING(100) },
      asset_condition: { type: Sequelize.ENUM('GOOD', 'FAIR', 'POOR', 'DAMAGED'), defaultValue: 'GOOD' },
      ownership_type: { type: Sequelize.STRING(50) },
      status_id: { type: Sequelize.INTEGER, references: { model: 'AssetStatuses', key: 'id' } },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      updated_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 17. Asset Accounting
    await queryInterface.createTable('AssetAccounting', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Assets', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      cost_of_purchase: { type: Sequelize.DECIMAL(15, 2) },
      residual_value: { type: Sequelize.DECIMAL(15, 2) },
      date_of_put_in_place: { type: Sequelize.DATE, allowNull: false },
      date_of_retirement: { type: Sequelize.DATE, allowNull: false },
      original_useful_life_years: { type: Sequelize.INTEGER, allowNull: false },
      method_of_depreciation: { type: Sequelize.ENUM('SLM', 'WDV', 'DECLINING_BALANCE'), defaultValue: 'SLM' },
      sale_of_asset: { type: Sequelize.ENUM('YES', 'NO', 'PARTIAL'), defaultValue: 'NO' },
      date_till_accumulated_dep: { type: Sequelize.DATE },
      accumulated_dep_opening_balance: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      scrap_value: { type: Sequelize.DECIMAL(15, 2) },
      asset_type_code: { type: Sequelize.STRING(50) },
      asset_sub_type: { type: Sequelize.STRING(50) },
      wdv_as_per_it_act: { type: Sequelize.DECIMAL(15, 2) }, // computed
      starting_wdv: { type: Sequelize.DECIMAL(15, 2) },
      closing_wdv: { type: Sequelize.DECIMAL(15, 2) }, // computed
      date_of_sale: { type: Sequelize.DATE },
      sale_value: { type: Sequelize.DECIMAL(15, 2) },
      profit_loss_on_sale: { type: Sequelize.DECIMAL(15, 2) }, // computed
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 18. Asset Tracking
    await queryInterface.createTable('AssetTracking', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Assets', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      location_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Locations', key: 'id' } },
      department_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Departments', key: 'id' } },
      sub_department_id: { type: Sequelize.INTEGER, references: { model: 'SubDepartments', key: 'id' } },
      region_id: { type: Sequelize.INTEGER, references: { model: 'Regions', key: 'id' } },
      tracking_date: { type: Sequelize.DATE },
      status: { type: Sequelize.STRING(50) },
      remarks: { type: Sequelize.TEXT },
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 19. Asset Performance
    await queryInterface.createTable('AssetPerformance', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Assets', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      down_time_hours: { type: Sequelize.DECIMAL(8, 2) },
      capacity_utilization_pct: { type: Sequelize.DECIMAL(5, 2) },
      performance_score: { type: Sequelize.DECIMAL(5, 2) },
      reason_for_downtime: { type: Sequelize.TEXT },
      recorded_date: { type: Sequelize.DATE, allowNull: false },
      remarks: { type: Sequelize.TEXT },
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 20. Asset Monitoring
    await queryInterface.createTable('AssetMonitoring', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Assets', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      monitoring_type: { type: Sequelize.STRING(100), allowNull: false },
      monitored_by: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
      monitored_date: { type: Sequelize.DATE, allowNull: false },
      next_monitoring_date: { type: Sequelize.DATE },
      status: { type: Sequelize.STRING(50) },
      remarks: { type: Sequelize.TEXT },
      created_by: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('AssetMonitoring');
    await queryInterface.dropTable('AssetPerformance');
    await queryInterface.dropTable('AssetTracking');
    await queryInterface.dropTable('AssetAccounting');
    await queryInterface.dropTable('Assets');
  }
};
