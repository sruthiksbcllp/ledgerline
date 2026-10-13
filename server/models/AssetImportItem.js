'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetImportItem extends Model {
    static associate(models) {
      AssetImportItem.belongsTo(models.AssetImportBatch, { foreignKey: 'batch_id' });
      AssetImportItem.belongsTo(models.AssetCategory, { foreignKey: 'category_id' });
      AssetImportItem.belongsTo(models.Location, { foreignKey: 'location_id' });
      AssetImportItem.belongsTo(models.Property, { foreignKey: 'property_id' });
      AssetImportItem.belongsTo(models.Department, { foreignKey: 'department_id' });
    }
  }
  AssetImportItem.init({
    batch_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_name: DataTypes.STRING,
    category_id: DataTypes.INTEGER,
    location_id: DataTypes.INTEGER,
    property_id: DataTypes.INTEGER,
    department_id: DataTypes.INTEGER,
    purchase_cost: DataTypes.DECIMAL(15, 2),
    raw_data: DataTypes.JSON,
    status: DataTypes.STRING,
    error_message: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'AssetImportItem',
    tableName: 'asset_import_items',
    freezeTableName: true,
    underscored: true
  });
  return AssetImportItem;
};
