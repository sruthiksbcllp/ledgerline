'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FinancialPeriod extends Model {}

  FinancialPeriod.init({
    year: { type: DataTypes.STRING(9), unique: true, allowNull: false },
    is_closed: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    closed_at: DataTypes.DATE,
    reopened_at: DataTypes.DATE,
    closed_by: DataTypes.INTEGER,
    reopened_by: DataTypes.INTEGER,
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 }
  }, {

    sequelize,
    modelName: 'FinancialPeriod',
    tableName: 'financialperiods',
    freezeTableName: true,
    timestamps: true,
  });

  return FinancialPeriod;
};
