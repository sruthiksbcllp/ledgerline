'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.showAllTables();
    const names = new Set(existing.map((t) => (typeof t === 'string' ? t : Object.values(t)[0])));
    if (!names.has('immutable_audit_log')) {
      await queryInterface.createTable('immutable_audit_log', {
        id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        client_id: { type: Sequelize.INTEGER, allowNull: true },
        user_id: { type: Sequelize.INTEGER, allowNull: true },
        action: { type: Sequelize.STRING(100), allowNull: false },
        module: { type: Sequelize.STRING(50), allowNull: false },
        entity_type: { type: Sequelize.STRING(50), allowNull: false },
        entity_id: { type: Sequelize.INTEGER, allowNull: true },
        before_hash: { type: Sequelize.STRING(64), allowNull: true },
        after_hash: { type: Sequelize.STRING(64), allowNull: true },
        payload: { type: Sequelize.JSON, allowNull: true },
        ip_address: { type: Sequelize.STRING(45), allowNull: true },
        user_agent: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      // Append-only by design: DB trigger rejects UPDATE/DELETE on immutable_audit_log.
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('immutable_audit_log').catch(() => {});
  }
};

