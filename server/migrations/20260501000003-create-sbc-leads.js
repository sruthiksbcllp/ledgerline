'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('sbc_leads')) return; // idempotent
    await queryInterface.createTable('sbc_leads', {
      id:             { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_name:    { type: Sequelize.STRING(255), allowNull: false },
      client_id:      { type: Sequelize.INTEGER, allowNull: true },
      contact_email:  { type: Sequelize.STRING(255), allowNull: true },
      contact_phone:  { type: Sequelize.STRING(50), allowNull: true },
      missing_assets: { type: Sequelize.INTEGER, defaultValue: 0 },
      risk_value:     { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      location:       { type: Sequelize.STRING(255), allowNull: true },
      status:         { type: Sequelize.ENUM('NEW', 'CONTACTED', 'CLOSED'), defaultValue: 'NEW' },
      created_at:     { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at:     { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('sbc_leads');
  }
};
