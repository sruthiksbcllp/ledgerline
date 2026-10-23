'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add status_lock columns (idempotent)
    const pr = await queryInterface.describeTable('purchaserequisitions');
    if (!pr.status_lock) {
      await queryInterface.addColumn('purchaserequisitions', 'status_lock', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    }
    const po = await queryInterface.describeTable('purchaseorders');
    if (!po.status_lock) {
      await queryInterface.addColumn('purchaseorders', 'status_lock', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    }

    // Add indexes — silently skip if they already exist
    const addIdx = async (table, fields, opts) => {
      try { await queryInterface.addIndex(table, fields, opts); } catch (e) { if (!e.message.includes('Duplicate')) throw e; }
    };
    await addIdx('activitylogs', ['user_id', 'module'], { name: 'idx_activity_logs_user_module' });
    await addIdx('assets', ['location_id', 'asset_code'], { name: 'idx_assets_loc_code' });
    await addIdx('purchaserequisitions', ['status', 'requestor_id'], { name: 'idx_pr_status_requestor' });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('purchaserequisitions', 'status_lock');
    await queryInterface.removeColumn('purchaseorders', 'status_lock');
    
    await queryInterface.removeIndex('activitylogs', 'idx_activity_logs_user_module');
    await queryInterface.removeIndex('assets', 'idx_assets_loc_code');
    await queryInterface.removeIndex('purchaserequisitions', 'idx_pr_status_requestor');
  }
};
