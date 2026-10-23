'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Asset Import Batches
    await queryInterface.createTable('asset_import_batches', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      file_name: { type: Sequelize.STRING, allowNull: false },
      uploaded_by: { type: Sequelize.INTEGER },
      status: { 
        type: Sequelize.ENUM('PENDING', 'PROCESSED', 'FAILED'), 
        defaultValue: 'PENDING' 
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // 2. Asset Import Items
    await queryInterface.createTable('asset_import_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      batch_id: { 
        type: Sequelize.INTEGER, 
        references: { model: 'asset_import_batches', key: 'id' },
        onDelete: 'CASCADE'
      },
      asset_name: { type: Sequelize.STRING },
      category_id: { type: Sequelize.INTEGER },
      location_id: { type: Sequelize.INTEGER },
      purchase_cost: { type: Sequelize.DECIMAL(15, 2) },
      status: { type: Sequelize.STRING },
      error_message: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // 3. Audit Planning (Using audit_plannings to avoid collision with existing AuditPlans)
    await queryInterface.createTable('audit_plannings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      audit_name: { type: Sequelize.STRING, allowNull: false },
      property_id: { type: Sequelize.INTEGER },
      location_id: { type: Sequelize.INTEGER },
      start_date: { type: Sequelize.DATE },
      end_date: { type: Sequelize.DATE },
      status: { 
        type: Sequelize.ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED'), 
        defaultValue: 'PLANNED' 
      },
      created_by: { type: Sequelize.INTEGER },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // 4. Maintenance Records
    await queryInterface.createTable('maintenance_records', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER },
      type: { type: Sequelize.ENUM('AMC', 'WARRANTY', 'SERVICE') },
      vendor_id: { type: Sequelize.INTEGER },
      start_date: { type: Sequelize.DATE },
      end_date: { type: Sequelize.DATE },
      cost: { type: Sequelize.DECIMAL(15, 2) },
      status: { type: Sequelize.STRING },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // 5. Dashboard Cache
    await queryInterface.createTable('dashboard_caches', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      cache_key: { type: Sequelize.STRING, unique: true },
      value: { type: Sequelize.JSON },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('dashboard_caches');
    await queryInterface.dropTable('maintenance_records');
    await queryInterface.dropTable('audit_plannings');
    await queryInterface.dropTable('asset_import_items');
    await queryInterface.dropTable('asset_import_batches');
  }
};
