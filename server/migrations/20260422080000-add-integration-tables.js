'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('integration_configs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      erp_type: {
        type: Sequelize.ENUM('SAP', 'TALLY', 'ORACLE', 'CUSTOM'),
        allowNull: false
      },
      base_url: Sequelize.STRING,
      auth_token: Sequelize.STRING,
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      sync_frequency: {
        type: Sequelize.STRING,
        defaultValue: 'real-time'
      },
      conflict_resolution: {
        type: Sequelize.STRING,
        defaultValue: 'ERP_WINS'
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

    await queryInterface.createTable('integration_queues', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      erp_type: {
        type: Sequelize.STRING,
        allowNull: false
      },
      action: {
        type: Sequelize.STRING,
        allowNull: false
      },
      payload: {
        type: Sequelize.JSON,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'PROCESSING', 'FAILED', 'COMPLETED'),
        defaultValue: 'PENDING'
      },
      retry_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      next_retry_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
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

    await queryInterface.createTable('integration_logs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      queue_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false
      },
      request_payload: {
        type: Sequelize.JSON,
        allowNull: true
      },
      response_payload: {
        type: Sequelize.JSON,
        allowNull: true
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true
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
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('integration_logs');
    await queryInterface.dropTable('integration_queues');
    await queryInterface.dropTable('integration_configs');
  }
};
