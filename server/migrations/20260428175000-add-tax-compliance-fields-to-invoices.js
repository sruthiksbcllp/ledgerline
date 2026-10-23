'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('invoices');
    const add = async (name, spec) => {
      if (!table[name]) await queryInterface.addColumn('invoices', name, spec);
    };

    await add('cgst_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: true });
    await add('sgst_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: true });
    await add('igst_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: true });
    await add('tds_rate_percent', { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 2 });
    await add('tds_section_code', { type: Sequelize.STRING(20), allowNull: true });
    await add('hsn_sac_code', { type: Sequelize.STRING(20), allowNull: true });
    await add('itc_eligible', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('invoices');
    const rm = async (name) => { if (table[name]) await queryInterface.removeColumn('invoices', name); };
    await rm('itc_eligible');
    await rm('hsn_sac_code');
    await rm('tds_section_code');
    await rm('tds_rate_percent');
    await rm('igst_amount');
    await rm('sgst_amount');
    await rm('cgst_amount');
  }
};
