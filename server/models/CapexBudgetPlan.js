'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CapexBudgetPlan extends Model {
    static associate(models) {
      CapexBudgetPlan.belongsTo(models.Department, { foreignKey: 'department_id' });
      CapexBudgetPlan.belongsTo(models.AssetCategory, { foreignKey: 'category_id' });
    }
  }

  CapexBudgetPlan.init({
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    financial_year: { type: DataTypes.STRING(10), allowNull: false },
    department_id: DataTypes.INTEGER,
    category_id: DataTypes.INTEGER,
    allocated_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    approved_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    actual_spend: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    committed_spend: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'CapexBudgetPlan',
    tableName: 'capexbudgets',
    freezeTableName: true,
    timestamps: false,
    underscored: true
  });

  return CapexBudgetPlan;
};
