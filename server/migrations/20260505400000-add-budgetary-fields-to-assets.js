'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('assets');
    if (!cols['is_budgetary']) {
      await queryInterface.addColumn('assets', 'is_budgetary', {
        type: Sequelize.BOOLEAN, defaultValue: false, allowNull: false
      });
      console.log('+ assets.is_budgetary');
    }
    if (!cols['budgetary_cost']) {
      await queryInterface.addColumn('assets', 'budgetary_cost', {
        type: Sequelize.DECIMAL(15, 2), allowNull: true, defaultValue: null
      });
      console.log('+ assets.budgetary_cost');
    }
    if (!cols['budgetary_useful_life']) {
      await queryInterface.addColumn('assets', 'budgetary_useful_life', {
        type: Sequelize.INTEGER, allowNull: true, defaultValue: null
      });
      console.log('+ assets.budgetary_useful_life');
    }
    if (!cols['budgetary_method']) {
      await queryInterface.addColumn('assets', 'budgetary_method', {
        type: Sequelize.STRING(10), allowNull: true, defaultValue: null
      });
      console.log('+ assets.budgetary_method');
    } else if (cols['budgetary_method'].type && cols['budgetary_method'].type.includes('ENUM')) {
      await queryInterface.changeColumn('assets', 'budgetary_method', {
        type: Sequelize.STRING(10), allowNull: true
      });
      console.log('~ assets.budgetary_method ENUM -> VARCHAR(10)');
    }
    if (!cols['budgetary_residual_value']) {
      await queryInterface.addColumn('assets', 'budgetary_residual_value', {
        type: Sequelize.DECIMAL(15, 2), allowNull: true, defaultValue: 0
      });
      console.log('+ assets.budgetary_residual_value');
    }
  },
  async down(queryInterface) {
    // Safe no-op
  }
};
