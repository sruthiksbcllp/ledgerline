'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('vendors');
    const add = async (name, spec) => {
      if (!table[name]) await queryInterface.addColumn('vendors', name, spec);
    };

    await add('gst_registered_state_code', { type: Sequelize.STRING(2), allowNull: true });
    await add('gst_expiry_date', { type: Sequelize.DATE, allowNull: true });
    await add('contract_expiry_date', { type: Sequelize.DATE, allowNull: true });
    await add('compliance_docs_expiry_date', { type: Sequelize.DATE, allowNull: true });
    await add('compliance_risk_score', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await add('compliance_risk_band', {
      type: Sequelize.ENUM('BLUE', 'GOLD', 'ORANGE', 'RED'),
      allowNull: false,
      defaultValue: 'BLUE'
    });
    await add('tds_section_code', { type: Sequelize.STRING(20), allowNull: true });
    await add('tds_rate_percent', { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 2 });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('vendors');
    const rm = async (name) => { if (table[name]) await queryInterface.removeColumn('vendors', name); };
    await rm('tds_rate_percent');
    await rm('tds_section_code');
    await rm('compliance_risk_band');
    await rm('compliance_risk_score');
    await rm('compliance_docs_expiry_date');
    await rm('contract_expiry_date');
    await rm('gst_expiry_date');
    await rm('gst_registered_state_code');
  }
};
