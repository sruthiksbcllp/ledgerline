'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('assetcategories');
    if (!table.companies_act_life) {
      await queryInterface.addColumn('assetcategories', 'companies_act_life', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
    if (!table.companies_act_method) {
      await queryInterface.addColumn('assetcategories', 'companies_act_method', {
        type: Sequelize.ENUM('SLM', 'WDV'),
        defaultValue: 'SLM'
      });
    }
    if (!table.it_act_rate) {
      await queryInterface.addColumn('assetcategories', 'it_act_rate', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true
      });
    }
    if (!table.it_act_block) {
      await queryInterface.addColumn('assetcategories', 'it_act_block', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('assetcategories', 'companies_act_life');
    await queryInterface.removeColumn('assetcategories', 'companies_act_method');
    await queryInterface.removeColumn('assetcategories', 'it_act_rate');
    await queryInterface.removeColumn('assetcategories', 'it_act_block');
  }
};
