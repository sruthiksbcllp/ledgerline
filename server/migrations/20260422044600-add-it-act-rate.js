'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('assetaccounting');
    if (!table.it_act_rate) {
      await queryInterface.addColumn('assetaccounting', 'it_act_rate', {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0,
        after: 'wdv_rate'
      });
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('assetaccounting', 'it_act_rate');
  }
};
