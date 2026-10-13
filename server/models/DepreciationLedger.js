'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DepreciationLedger extends Model {
    static associate(models) {
      DepreciationLedger.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      DepreciationLedger.belongsTo(models.AssetAccounting, { foreignKey: 'accounting_id' });
      DepreciationLedger.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
    }
  }
  DepreciationLedger.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    accounting_id: DataTypes.INTEGER,
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    book_type: { 
      type: DataTypes.ENUM('SLM_COMPANIES_ACT', 'WDV_IT_ACT', 'BUDGETARY'), 
      allowNull: false 
    },
    fiscal_year: { type: DataTypes.STRING(9), allowNull: false },
    period_month: { type: DataTypes.INTEGER, allowNull: false },
    opening_value: DataTypes.DECIMAL(15, 2),
    depreciation_amount: DataTypes.DECIMAL(15, 2),
    closing_value: DataTypes.DECIMAL(15, 2),
    accumulated_depreciation: DataTypes.DECIMAL(15, 2),
    is_prorata: { type: DataTypes.BOOLEAN, defaultValue: false },
    prorata_days: DataTypes.INTEGER,
    year_closed: { type: DataTypes.BOOLEAN, defaultValue: false },
    calculated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    calculated_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'DepreciationLedger',
    tableName: 'depreciationledgers',
    freezeTableName: true,
  });
  return DepreciationLedger;
};
