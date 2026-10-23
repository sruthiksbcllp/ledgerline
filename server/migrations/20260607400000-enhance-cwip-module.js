'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // --- 1. Extend cwip_projects ---
    const projDesc = await queryInterface.describeTable('cwip_projects');

    // Extend status ENUM (MySQL requires column modify)
    if (projDesc.status) {
      await queryInterface.changeColumn('cwip_projects', 'status', {
        type: Sequelize.ENUM('PLANNING', 'PROCUREMENT', 'IN_PROGRESS', 'OPEN', 'CLOSED', 'CAPITALIZED'),
        defaultValue: 'PLANNING'
      });
    }

    if (!projDesc.percentage_complete) {
      await queryInterface.addColumn('cwip_projects', 'percentage_complete', {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0,
        comment: '0.00 to 100.00'
      });
    }

    if (!projDesc.estimated_end_date) {
      await queryInterface.addColumn('cwip_projects', 'estimated_end_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      });
    }

    if (!projDesc.project_type) {
      await queryInterface.addColumn('cwip_projects', 'project_type', {
        type: Sequelize.ENUM('SINGLE_ASSET', 'MULTI_ASSET'),
        defaultValue: 'SINGLE_ASSET'
      });
    }

    if (!projDesc.department_id) {
      await queryInterface.addColumn('cwip_projects', 'department_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    if (!projDesc.category_id) {
      await queryInterface.addColumn('cwip_projects', 'category_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    if (!projDesc.location_id) {
      await queryInterface.addColumn('cwip_projects', 'location_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    // Interest capitalization fields
    if (!projDesc.borrowing_rate) {
      await queryInterface.addColumn('cwip_projects', 'borrowing_rate', {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0,
        comment: 'Weighted avg borrowing rate %'
      });
    }

    if (!projDesc.interest_capitalized) {
      await queryInterface.addColumn('cwip_projects', 'interest_capitalized', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0,
        comment: 'Total interest added to project cost'
      });
    }

    if (!projDesc.interest_start_date) {
      await queryInterface.addColumn('cwip_projects', 'interest_start_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      });
    }

    if (!projDesc.interest_end_date) {
      await queryInterface.addColumn('cwip_projects', 'interest_end_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'NULL = still accruing; set on capitalization'
      });
    }

    // --- 2. Create cwip_milestones table ---
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('cwip_milestones')) {
      await queryInterface.createTable('cwip_milestones', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        project_id: { type: Sequelize.INTEGER, allowNull: false },
        name: { type: Sequelize.STRING(255), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        target_date: { type: Sequelize.DATEONLY, allowNull: true },
        completed_date: { type: Sequelize.DATEONLY, allowNull: true },
        percentage_weight: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0,
          comment: 'Weight of this milestone in overall % complete'
        },
        status: {
          type: Sequelize.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED'),
          defaultValue: 'PENDING'
        },
        capitalize_on_complete: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: 'If true, triggers partial/full capitalization when milestone completes'
        },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    // --- 3. Create cwip_project_assets linking table (multi-asset projects) ---
    if (!tables.includes('cwip_project_assets')) {
      await queryInterface.createTable('cwip_project_assets', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        project_id: { type: Sequelize.INTEGER, allowNull: false },
        asset_id: { type: Sequelize.INTEGER, allowNull: true, comment: 'NULL until capitalized' },
        asset_name: { type: Sequelize.STRING(255), allowNull: false },
        category_id: { type: Sequelize.INTEGER, allowNull: true },
        estimated_cost: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
        actual_cost: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
        status: {
          type: Sequelize.ENUM('PLANNED', 'IN_PROGRESS', 'CAPITALIZED'),
          defaultValue: 'PLANNED'
        },
        capitalized_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    // Backfill: existing OPEN projects → keep as OPEN (backward compat)
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cwip_project_assets');
    await queryInterface.dropTable('cwip_milestones');

    const projDesc = await queryInterface.describeTable('cwip_projects');
    if (projDesc.interest_end_date) await queryInterface.removeColumn('cwip_projects', 'interest_end_date');
    if (projDesc.interest_start_date) await queryInterface.removeColumn('cwip_projects', 'interest_start_date');
    if (projDesc.interest_capitalized) await queryInterface.removeColumn('cwip_projects', 'interest_capitalized');
    if (projDesc.borrowing_rate) await queryInterface.removeColumn('cwip_projects', 'borrowing_rate');
    if (projDesc.location_id) await queryInterface.removeColumn('cwip_projects', 'location_id');
    if (projDesc.category_id) await queryInterface.removeColumn('cwip_projects', 'category_id');
    if (projDesc.department_id) await queryInterface.removeColumn('cwip_projects', 'department_id');
    if (projDesc.project_type) await queryInterface.removeColumn('cwip_projects', 'project_type');
    if (projDesc.estimated_end_date) await queryInterface.removeColumn('cwip_projects', 'estimated_end_date');
    if (projDesc.percentage_complete) await queryInterface.removeColumn('cwip_projects', 'percentage_complete');
  }
};
