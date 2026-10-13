'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ItActBlockLedger extends Model {
    static associate(models) {
      ItActBlockLedger.hasMany(models.ItActBlockAssetAlloc, { foreignKey: 'block_ledger_id', as: 'allocations' });
    }
  }
  ItActBlockLedger.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    it_act_block: { type: DataTypes.STRING(100), allowNull: false },
    it_act_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    fiscal_year: { type: DataTypes.STRING(9), allowNull: false },
    opening_wdv: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    additions_full: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    additions_half: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    sale_proceeds: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    depreciation: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    closing_wdv: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    short_term_capital_gain: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    short_term_capital_loss: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    block_ceased: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.ENUM('DRAFT', 'POSTED'), defaultValue: 'POSTED' },
    computed_at: { type: DataTypes.DATE },
  }, { sequelize, modelName: 'ItActBlockLedger', tableName: 'it_act_block_ledger', freezeTableName: true, timestamps: true });
  return ItActBlockLedger;
};
