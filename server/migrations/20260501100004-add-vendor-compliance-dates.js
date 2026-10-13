'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('vendors');
    const add = async (name, spec) => {
      if (!table[name]) await queryInterface.addColumn('vendors', name, spec);
    };
    await add('gst_expiry_date', { type: Sequelize.DATEONLY, allowNull: true });
    await add('msme_expiry_date', { type: Sequelize.DATEONLY, allowNull: true });
    await add('pan_verified', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await add('compliance_score', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 });
    await add('compliance_last_checked', { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('vendors');
    const drop = async (name) => {
      if (table[name]) await queryInterface.removeColumn('vendors', name);
    };
    await drop('compliance_last_checked');
    await drop('compliance_score');
    await drop('pan_verified');
    await drop('msme_expiry_date');
    await drop('gst_expiry_date');
  }
};

