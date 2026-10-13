'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable('asset_sub_categories');
    const cols = [
      { name: 'useful_life', def: { type: Sequelize.INTEGER, allowNull: true, comment: 'Schedule II useful life in years' } },
      { name: 'companies_act_life', def: { type: Sequelize.INTEGER, allowNull: true } },
      { name: 'companies_act_method', def: { type: Sequelize.ENUM('SLM', 'WDV'), defaultValue: 'SLM', allowNull: true } },
      { name: 'it_act_rate', def: { type: Sequelize.DECIMAL(5, 2), allowNull: true } },
      { name: 'it_act_block', def: { type: Sequelize.STRING(100), allowNull: true } },
      { name: 'schedule_ii_classification', def: { type: Sequelize.STRING(200), allowNull: true } },
      { name: 'residual_pct', def: { type: Sequelize.DECIMAL(5, 2), defaultValue: 5, allowNull: true } },
    ];
    for (const col of cols) {
      if (!tableDesc[col.name]) {
        await queryInterface.addColumn('asset_sub_categories', col.name, col.def);
      }
    }
  },
  down: async (queryInterface) => {
    for (const col of ['useful_life','companies_act_life','companies_act_method','it_act_rate','it_act_block','schedule_ii_classification','residual_pct']) {
      await queryInterface.removeColumn('asset_sub_categories', col);
    }
  }
};
