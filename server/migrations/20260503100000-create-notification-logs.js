'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('notificationlogs', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'clients', key: 'id' }, onDelete: 'CASCADE' },
      entity_type: { type: Sequelize.ENUM('MAINTENANCE', 'INSURANCE', 'WARRANTY'), allowNull: false },
      entity_id: { type: Sequelize.INTEGER, allowNull: false },
      notification_type: { type: Sequelize.ENUM('EMAIL', 'SMS'), defaultValue: 'EMAIL' },
      sent_to: { type: Sequelize.STRING(255), allowNull: false },
      subject: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.ENUM('SENT', 'FAILED'), defaultValue: 'SENT' },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      sent_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await queryInterface.addIndex('notificationlogs', ['client_id']);
    await queryInterface.addIndex('notificationlogs', ['entity_type']);
    await queryInterface.addIndex('notificationlogs', ['entity_id']);
    await queryInterface.addIndex('notificationlogs', ['sent_at']);
    await queryInterface.addIndex('notificationlogs', ['client_id', 'entity_type', 'entity_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('notificationlogs');
  }
};
