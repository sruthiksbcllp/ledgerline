'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetAccounting extends Model {
    static associate(models) {
      AssetAccounting.belongsTo(models.Asset, { foreignKey: 'asset_id' });
    }
  }
  AssetAccounting.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false, unique: true }, // 1:1 with Asset — unique so upsert is insert-or-update (no duplicate accounting rows)
    cost_of_purchase: DataTypes.DECIMAL(15, 2),
    residual_value: DataTypes.DECIMAL(15, 2),
    date_of_put_in_place: { type: DataTypes.DATE, allowNull: false },
    date_of_retirement: { type: DataTypes.DATE, allowNull: false },
    original_useful_life_years: { type: DataTypes.INTEGER, allowNull: false },
    method_of_depreciation: { type: DataTypes.ENUM('SLM', 'WDV', 'DECLINING_BALANCE'), defaultValue: 'SLM' },
    wdv_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    it_act_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },


    sale_of_asset: { type: DataTypes.ENUM('YES', 'NO', 'PARTIAL'), defaultValue: 'NO' },
    date_till_accumulated_dep: DataTypes.DATE,
    accumulated_dep_opening_balance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    scrap_value: DataTypes.DECIMAL(15, 2),
    asset_type_code: DataTypes.STRING(50),
    asset_sub_type: DataTypes.STRING(50),
    wdv_as_per_it_act: DataTypes.DECIMAL(15, 2),
    starting_wdv: DataTypes.DECIMAL(15, 2),
    closing_wdv: DataTypes.DECIMAL(15, 2),
    date_of_sale: DataTypes.DATE,
    sale_value: DataTypes.DECIMAL(15, 2),
    profit_loss_on_sale: DataTypes.DECIMAL(15, 2),
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AssetAccounting',
    tableName: 'assetaccounting',
    freezeTableName: true,
    timestamps: false
  });
  return AssetAccounting;
};
