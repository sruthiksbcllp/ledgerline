'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetCategory extends Model {
    static associate(models) {
      AssetCategory.belongsTo(models.AssetCategory, { foreignKey: 'parent_id', as: 'Parent' });
      AssetCategory.hasMany(models.AssetCategory, { foreignKey: 'parent_id', as: 'Children' });
      AssetCategory.hasMany(models.AssetSubCategory, { foreignKey: 'category_id' });
      AssetCategory.hasMany(models.Asset, { foreignKey: 'category_id' });
    }
  }
  AssetCategory.init({
    category_name: { type: DataTypes.STRING, allowNull: false },
    category_description: DataTypes.TEXT,
    parent_id: DataTypes.INTEGER,
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
    companies_act_life: DataTypes.INTEGER,
    companies_act_method: { type: DataTypes.ENUM('SLM', 'WDV'), defaultValue: 'SLM' },
    it_act_rate: DataTypes.DECIMAL(5, 2),
    it_act_block: DataTypes.STRING(100),
    code: DataTypes.STRING,
    useful_life: DataTypes.INTEGER,
    depreciation_method: { type: DataTypes.ENUM('SLM', 'WDV'), defaultValue: 'SLM' },
    companies_act_residual_percent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 5 },
    pm_interval_days: { type: DataTypes.INTEGER, defaultValue: 365 },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    }


  }, {
    sequelize,
    modelName: 'AssetCategory',
    tableName: 'asset_categories',
    freezeTableName: true,
    timestamps: true,
  });
  return AssetCategory;
};
