'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('activitylogs');
    const defs = [
      ['actor_role', 'VARCHAR(100) NULL'],
      ['request_method', 'VARCHAR(20) NULL'],
      ['request_path', 'VARCHAR(255) NULL'],
      ['user_agent', 'VARCHAR(255) NULL'],
      ['metadata', 'JSON NULL'],
      ['previous_hash', 'VARCHAR(64) NULL'],
      ['entry_hash', 'VARCHAR(64) NULL']
    ];
    for (const [name, ddl] of defs) {
      if (!table[name]) {
        await queryInterface.sequelize.query(`ALTER TABLE activitylogs ADD COLUMN ${name} ${ddl}`);
      }
    }

    await queryInterface.addIndex('activitylogs', ['entry_hash'], {
      name: 'idx_activitylogs_entry_hash'
    }).catch(() => {});
    await queryInterface.addIndex('activitylogs', ['module', 'action', 'createdAt'], {
      name: 'idx_activitylogs_module_action_created'
    }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('activitylogs', 'idx_activitylogs_module_action_created').catch(() => {});
    await queryInterface.removeIndex('activitylogs', 'idx_activitylogs_entry_hash').catch(() => {});
    const table = await queryInterface.describeTable('activitylogs');
    const cols = [
      'entry_hash',
      'previous_hash',
      'metadata',
      'user_agent',
      'request_path',
      'request_method',
      'actor_role'
    ];
    for (const col of cols) {
      if (table[col]) {
        await queryInterface.sequelize.query(`ALTER TABLE activitylogs DROP COLUMN ${col}`);
      }
    }
  }
};
