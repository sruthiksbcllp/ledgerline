'use strict';
const { Model } = require('sequelize');

/**
 * Chart of accounts, per company. Seeded with the AP accounts the journal engine posts to
 * (services/apJournal.service.js); codes follow the P2P blueprint (1 assets, 2 liabilities, 5–6 costs).
 */
module.exports = (sequelize, DataTypes) => {
  class GlAccount extends Model {}
  GlAccount.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    code: { type: DataTypes.STRING(20), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    type: { type: DataTypes.STRING(20), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, {
    sequelize,
    modelName: 'GlAccount',
    tableName: 'gl_accounts',
    freezeTableName: true,
    underscored: true
  });
  return GlAccount;
};
