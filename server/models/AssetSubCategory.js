'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetSubCategory extends Model {
    static associate(models) {
      AssetSubCategory.belongsTo(models.AssetCategory, { foreignKey: 'category_id' });
      AssetSubCategory.hasMany(models.Asset, { foreignKey: 'sub_category_id' });
    }
  }
  AssetSubCategory.init({
    sub_category_name: { type: DataTypes.STRING, allowNull: false },
    category_id: { type: DataTypes.INTEGER, allowNull: false },
    description: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
    useful_life: { type: DataTypes.INTEGER, comment: 'Schedule II useful life in years' },
    companies_act_life: { type: DataTypes.INTEGER },
    companies_act_method: { type: DataTypes.ENUM('SLM', 'WDV'), defaultValue: 'SLM' },
    it_act_rate: { type: DataTypes.DECIMAL(5, 2) },
    it_act_block: { type: DataTypes.STRING(100) },
    schedule_ii_classification: { type: DataTypes.STRING(200), comment: 'Full Schedule II label e.g. Plant & Machinery — General (Continuous Process)' },
    residual_pct: { type: DataTypes.DECIMAL(5, 2), defaultValue: 5, comment: 'Residual value % — cannot exceed 5% per Schedule II' }
  }, {
    sequelize,
    modelName: 'AssetSubCategory',
    tableName: 'asset_sub_categories',
    freezeTableName: true,
    timestamps: true,
  });
  return AssetSubCategory;
};
