'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('assetinsurances', {
      id:              { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      asset_id:        { type: Sequelize.INTEGER, allowNull: false, references: { model: 'assets', key: 'id' }, onDelete: 'CASCADE' },
      client_id:       { type: Sequelize.INTEGER, allowNull: true },
      policy_number:   { type: Sequelize.STRING(100), allowNull: false },
      insurer_name:    { type: Sequelize.STRING(200), allowNull: false },
      policy_type:     { type: Sequelize.ENUM('FIRE','THEFT','COMPREHENSIVE','LIABILITY','MARINE','OTHER'), defaultValue: 'COMPREHENSIVE' },
      sum_insured:     { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
      premium_amount:  { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
      premium_frequency: { type: Sequelize.ENUM('ANNUAL','SEMI_ANNUAL','QUARTERLY','MONTHLY'), defaultValue: 'ANNUAL' },
      start_date:      { type: Sequelize.DATEONLY, allowNull: false },
      expiry_date:     { type: Sequelize.DATEONLY, allowNull: false },
      renewal_reminder_days: { type: Sequelize.INTEGER, defaultValue: 30 },
      status:          { type: Sequelize.ENUM('ACTIVE','EXPIRED','CANCELLED','PENDING_RENEWAL'), defaultValue: 'ACTIVE' },
      nominee:         { type: Sequelize.STRING(200), allowNull: true },
      notes:           { type: Sequelize.TEXT, allowNull: true },
      document_url:    { type: Sequelize.STRING(500), allowNull: true },
      created_by:      { type: Sequelize.INTEGER, allowNull: true },
      created_at:      { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:      { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('assetinsurances', ['asset_id']);
    await queryInterface.addIndex('assetinsurances', ['client_id']);
    await queryInterface.addIndex('assetinsurances', ['expiry_date']);
    await queryInterface.addIndex('assetinsurances', ['status']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('assetinsurances');
  }
};
