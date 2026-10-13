'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('vendors');
    if (!table.gstin_status) {
      await queryInterface.addColumn('vendors', 'gstin_status', {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'UNVERIFIED'
      });
    }
    if (!table.gstin_validated_at) {
      await queryInterface.addColumn('vendors', 'gstin_validated_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable('vendors');
    if (table.gstin_validated_at) await queryInterface.removeColumn('vendors', 'gstin_validated_at');
    if (table.gstin_status) await queryInterface.removeColumn('vendors', 'gstin_status');
  }
};

