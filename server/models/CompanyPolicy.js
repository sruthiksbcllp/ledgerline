'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CompanyPolicy extends Model {
    static associate(models) {
      CompanyPolicy.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
    }
  }
  CompanyPolicy.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    min_cost_to_capitalize: { type: DataTypes.DECIMAL(15, 2), defaultValue: 5000.00 },
    allow_override_by_cost_center: { type: DataTypes.BOOLEAN, defaultValue: false },
    depreciation_method_primary: {
      type: DataTypes.ENUM('SLM', 'WDV', 'DECLINING_BALANCE'),
      defaultValue: 'SLM'
    },
    depreciation_method_secondary: {
      type: DataTypes.ENUM('SLM', 'WDV', 'DECLINING_BALANCE', 'NONE'),
      defaultValue: 'WDV'
    },
    allow_custom_useful_life: { type: DataTypes.BOOLEAN, defaultValue: true },
    allow_residual_value_override: { type: DataTypes.BOOLEAN, defaultValue: false },
    approval_required_above: { type: DataTypes.DECIMAL(15, 2), defaultValue: 100000.00 },
    multi_level_approval_above: { type: DataTypes.DECIMAL(15, 2), defaultValue: 500000.00 },
    allow_inter_company_transfer: { type: DataTypes.BOOLEAN, defaultValue: true },
    transfer_requires_approval: { type: DataTypes.BOOLEAN, defaultValue: true },
    transfer_approval_days: { type: DataTypes.INTEGER, defaultValue: 5 },
    consolidated_report_visibility: {
      type: DataTypes.ENUM('COMPANY_ONLY', 'GROUP', 'SUPER_ADMIN'),
      defaultValue: 'COMPANY_ONLY'
    }
  }, {
    sequelize,
    tableName: 'company_policies',
    modelName: 'CompanyPolicy',
    timestamps: true,
    underscored: true
  });
  return CompanyPolicy;
};
