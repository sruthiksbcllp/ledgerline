'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable('assets');
    if (!tableDesc.gst_amount) {
      await queryInterface.addColumn('assets', 'gst_amount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0,
        allowNull: true
      });
    }
    // Fix default for gst_eligible to true (ITC eligible is the normal case)
    if (tableDesc.gst_eligible) {
      await queryInterface.changeColumn('assets', 'gst_eligible', {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: true
      });
    }
  },
  down: async (queryInterface) => {
    const tableDesc = await queryInterface.describeTable('assets');
    if (tableDesc.gst_amount) {
      await queryInterface.removeColumn('assets', 'gst_amount');
    }
  }
};
