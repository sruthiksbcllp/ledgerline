'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cwip_projects', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      project_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      start_date: {
        type: Sequelize.DATE
      },
      status: {
        type: Sequelize.ENUM('OPEN', 'CLOSED', 'CAPITALIZED'),
        defaultValue: 'OPEN'
      },
      total_cost: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.createTable('cwip_entries', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'cwip_projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      expense_type: {
        type: Sequelize.ENUM('Material', 'Labor', 'Installation', 'Other'),
        defaultValue: 'Material'
      },
      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      vendor_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      date: {
        type: Sequelize.DATE
      },
      remarks: {
        type: Sequelize.TEXT
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add cwip_project_id to Assets
    const tableInfo = await queryInterface.describeTable('assets');
    if (!tableInfo.cwip_project_id) {
      await queryInterface.addColumn('assets', 'cwip_project_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    if (!tableInfo.capitalization_date) {
      await queryInterface.addColumn('assets', 'capitalization_date', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    // Modify ENUM for source_type if possible, but SQLite doesn't support ALTER TABLE for ENUMS natively.
    // In MySQL/Postgres it might be possible. We will skip modifying the ENUM in DB and let Sequelize handle the validation.
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('cwip_entries');
    await queryInterface.dropTable('cwip_projects');
  }
};
