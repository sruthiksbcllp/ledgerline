'use strict';
const { Model } = require('sequelize');

/** Monthly purchase fund limit for a company (period YYYY-MM). See services/poFund.service.js. */
module.exports = (sequelize, DataTypes) => {
  class PoFundLimit extends Model {}
  PoFundLimit.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.STRING(7), allowNull: false },
    limit_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    remarks: { type: DataTypes.STRING(500), allowNull: true },
    set_by: { type: DataTypes.INTEGER, allowNull: true },
    set_by_name: { type: DataTypes.STRING(150), allowNull: true }
  }, {
    sequelize,
    modelName: 'PoFundLimit',
    tableName: 'po_fund_limits',
    freezeTableName: true,
    underscored: true
  });
  return PoFundLimit;
};
