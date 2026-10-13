'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = async (name) => {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${name}'`
      );
      return rows.length > 0;
    };

    if (!(await tableExists('sla_rules'))) {
      await queryInterface.createTable('sla_rules', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 1 },
        alert_type: { type: Sequelize.STRING(50) },
        priority: { type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') },
        max_response_time_minutes: { type: Sequelize.INTEGER },
        escalate_to: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true }
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sla_rules');
  }
};
