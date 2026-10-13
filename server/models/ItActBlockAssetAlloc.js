'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ItActBlockAssetAlloc extends Model {
    static associate(models) {
      ItActBlockAssetAlloc.belongsTo(models.ItActBlockLedger, { foreignKey: 'block_ledger_id', as: 'block' });
    }
  }
  ItActBlockAssetAlloc.init({
    block_ledger_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    fiscal_year: { type: DataTypes.STRING(9), allowNull: false },
    opening_wdv: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    addition: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    addition_flag: { type: DataTypes.ENUM('FULL', 'HALF', 'NONE'), defaultValue: 'NONE' },
    allocated_depreciation: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    closing_wdv: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
  }, { sequelize, modelName: 'ItActBlockAssetAlloc', tableName: 'it_act_block_asset_alloc', freezeTableName: true, timestamps: true });
  return ItActBlockAssetAlloc;
};
