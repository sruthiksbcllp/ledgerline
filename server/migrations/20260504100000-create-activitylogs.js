'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(t => t.includes('activitylogs'));
    if (tableExists) return;

    await queryInterface.createTable('activitylogs', {
      id:             { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id:        { type: Sequelize.INTEGER, allowNull: false },
      action:         { type: Sequelize.STRING(100), allowNull: false },
      module:         { type: Sequelize.STRING(100), allowNull: false },
      record_id:      { type: Sequelize.INTEGER },
      description:    { type: Sequelize.TEXT },
      old_values:     { type: Sequelize.JSON },
      new_values:     { type: Sequelize.JSON },
      ip_address:     { type: Sequelize.STRING(45) },
      client_id:      { type: Sequelize.INTEGER },
      actor_role:     { type: Sequelize.STRING(100) },
      request_method: { type: Sequelize.STRING(20) },
      request_path:   { type: Sequelize.STRING(255) },
      user_agent:     { type: Sequelize.STRING(255) },
      metadata:       { type: Sequelize.JSON },
      previous_hash:  { type: Sequelize.STRING(64) },
      entry_hash:     { type: Sequelize.STRING(64) },
      createdAt:      { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await queryInterface.addIndex('activitylogs', ['user_id']);
    await queryInterface.addIndex('activitylogs', ['client_id']);
    await queryInterface.addIndex('activitylogs', ['module']);
    await queryInterface.addIndex('activitylogs', ['action']);
    await queryInterface.addIndex('activitylogs', ['createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('activitylogs');
  }
};
