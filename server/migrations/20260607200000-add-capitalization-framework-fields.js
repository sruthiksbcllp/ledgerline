'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('assets');

    if (!tableDesc.capitalization_type) {
      await queryInterface.addColumn('assets', 'capitalization_type', {
        type: Sequelize.ENUM('CAPITALIZE', 'EXPENSE', 'CWIP'),
        allowNull: true,
        defaultValue: null
      });
    }

    if (!tableDesc.capex_request_id) {
      await queryInterface.addColumn('assets', 'capex_request_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
      });
    }

    if (!tableDesc.auto_classified) {
      await queryInterface.addColumn('assets', 'auto_classified', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    }

    // Backfill: mark CWIP-sourced assets as CAPITALIZE, budgetary as EXPENSE
    await queryInterface.sequelize.query(`
      UPDATE assets SET capitalization_type = 'CWIP' WHERE source_type = 'CWIP' AND capitalization_type IS NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE assets SET capitalization_type = 'EXPENSE' WHERE is_budgetary = 1 AND capitalization_type IS NULL
    `);
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('assets');
    if (tableDesc.auto_classified) await queryInterface.removeColumn('assets', 'auto_classified');
    if (tableDesc.capex_request_id) await queryInterface.removeColumn('assets', 'capex_request_id');
    if (tableDesc.capitalization_type) await queryInterface.removeColumn('assets', 'capitalization_type');
  }
};
