'use strict';

module.exports = {
  async up(queryInterface) {
    const table = await queryInterface.describeTable('assets');
    const defs = [
      ['useful_life_years', 'INT NULL'],
      ['co_act_dep_slm_annual', 'DECIMAL(18,2) NULL'],
      ['co_act_dep_wdv_annual', 'DECIMAL(18,2) NULL'],
      ['co_act_accumulated_dep', 'DECIMAL(18,2) NULL'],
      ['co_act_wdv_remaining', 'DECIMAL(18,2) NULL'],
      ['co_act_residual_value', 'DECIMAL(18,2) NULL'],
      ['co_act_depreciation_method', "VARCHAR(10) DEFAULT 'SLM'"],
      ['it_act_dep_wdv_rate', 'DECIMAL(5,2) NULL'],
      ['it_act_dep_annual', 'DECIMAL(18,2) NULL'],
      ['it_act_accumulated_dep', 'DECIMAL(18,2) NULL'],
      ['it_act_wdv_remaining', 'DECIMAL(18,2) NULL'],
      ['it_act_half_year_rule', 'TINYINT(1) DEFAULT 0'],
      ['it_act_fy', 'VARCHAR(10) NULL'],
      ['shift_type', "VARCHAR(10) DEFAULT 'single'"]
    ];

    for (const [name, ddl] of defs) {
      if (!table[name]) {
        await queryInterface.sequelize.query(`ALTER TABLE assets ADD COLUMN ${name} ${ddl}`);
      }
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('assets');
    const cols = [
      'useful_life_years',
      'co_act_dep_slm_annual',
      'co_act_dep_wdv_annual',
      'co_act_accumulated_dep',
      'co_act_wdv_remaining',
      'co_act_residual_value',
      'co_act_depreciation_method',
      'it_act_dep_wdv_rate',
      'it_act_dep_annual',
      'it_act_accumulated_dep',
      'it_act_wdv_remaining',
      'it_act_half_year_rule',
      'it_act_fy',
      'shift_type'
    ];
    for (const col of cols) {
      if (table[col]) {
        await queryInterface.sequelize.query(`ALTER TABLE assets DROP COLUMN ${col}`);
      }
    }
  }
};
