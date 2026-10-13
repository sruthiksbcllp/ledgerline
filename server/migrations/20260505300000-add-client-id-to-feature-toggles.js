'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const cols = await queryInterface.describeTable('featuretoggles');
      if (!cols.client_id) {
        await queryInterface.addColumn('featuretoggles', 'client_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
          after: 'id'
        });
        // Remove old unique constraint on feature_key alone
        try {
          await queryInterface.removeIndex('featuretoggles', ['feature_key']);
        } catch(e) { /* index may not exist by that name */ }
        // Add composite unique: one row per (feature_key, client_id)
        await queryInterface.addIndex('featuretoggles', ['feature_key', 'client_id'], {
          unique: true,
          name: 'featuretoggles_key_client_unique'
        });
        console.log('  + featuretoggles.client_id added');
      } else {
        console.log('  = featuretoggles.client_id already exists');
      }
    } catch(e) {
      console.log('  ! skipped:', e.message);
    }
  },
  async down(queryInterface) {}
};
