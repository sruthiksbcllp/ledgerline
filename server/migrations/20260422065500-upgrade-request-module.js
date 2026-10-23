'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    // ── 1. Upgrade `Requests` table ────────────────────────────────────────────
    const reqCols = await queryInterface.describeTable('requests');

    if (!reqCols.request_number) {
      await queryInterface.addColumn('requests', 'request_number', { type: Sequelize.STRING, unique: true });
    }
    if (!reqCols.department_id) {
      await queryInterface.addColumn('requests', 'department_id', { type: Sequelize.INTEGER });
    }
    if (!reqCols.property_id) {
      await queryInterface.addColumn('requests', 'property_id', { type: Sequelize.INTEGER });
    }
    if (!reqCols.total_items) {
      await queryInterface.addColumn('requests', 'total_items', { type: Sequelize.INTEGER, defaultValue: 0 });
    }
    if (!reqCols.remarks) {
      await queryInterface.addColumn('requests', 'remarks', { type: Sequelize.TEXT });
    }
    if (!reqCols.workflow_id) {
      await queryInterface.addColumn('requests', 'workflow_id', { type: Sequelize.INTEGER });
    }
    if (!reqCols.current_level) {
      await queryInterface.addColumn('requests', 'current_level', { type: Sequelize.INTEGER, defaultValue: 0 });
    }
    if (!reqCols.total_approval_levels) {
      await queryInterface.addColumn('requests', 'total_approval_levels', { type: Sequelize.INTEGER, defaultValue: 0 });
    }
    if (!reqCols.is_fully_approved) {
      await queryInterface.addColumn('requests', 'is_fully_approved', { type: Sequelize.BOOLEAN, defaultValue: false });
    }
    if (!reqCols.converted_to_id) {
      await queryInterface.addColumn('requests', 'converted_to_id', { type: Sequelize.INTEGER });
    }
    if (!reqCols.converted_to_type) {
      await queryInterface.addColumn('requests', 'converted_to_type', { type: Sequelize.STRING });
    }
    if (!reqCols.total_estimated_value) {
      await queryInterface.addColumn('requests', 'total_estimated_value', { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    }
    if (!reqCols.created_at) {
      await queryInterface.addColumn('requests', 'created_at', {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      });
    }
    if (!reqCols.updated_at) {
      await queryInterface.addColumn('requests', 'updated_at', {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      });
    }

    // Change status ENUM to include new statuses
    await queryInterface.changeColumn('requests', 'status', {
      type: Sequelize.ENUM('DRAFT', 'SUBMITTED', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'PROCESSED', 'PENDING'),
      defaultValue: 'DRAFT'
    });

    // Change request_type ENUM to support all types
    await queryInterface.changeColumn('requests', 'request_type', {
      type: Sequelize.ENUM('PURCHASE', 'TRANSFER', 'DISPOSAL', 'ISSUE', 'MAINTENANCE', 'NEW', 'REFILL', 'SPARE_PART', 'REPAIR', 'REPLACEMENT', 'OTHER'),
      allowNull: false
    });

    // ── 2. Create `RequestItems` table ─────────────────────────────────────────
    if (!tables.includes('requestitems')) {
      await queryInterface.createTable('requestitems', {
        id:               { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        request_id:       { type: Sequelize.INTEGER, allowNull: false, references: { model: 'requests', key: 'id' }, onDelete: 'CASCADE' },
        asset_id:         { type: Sequelize.INTEGER },
        item_id:          { type: Sequelize.INTEGER },
        item_name:        { type: Sequelize.STRING },
        quantity:         { type: Sequelize.DECIMAL(10, 2), defaultValue: 1 },
        unit:             { type: Sequelize.STRING, defaultValue: 'unit' },
        estimated_cost:   { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
        from_location_id: { type: Sequelize.INTEGER },
        to_location_id:   { type: Sequelize.INTEGER },
        reason:           { type: Sequelize.TEXT },
        remarks:          { type: Sequelize.TEXT },
        created_at:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('requestitems');
  }
};
