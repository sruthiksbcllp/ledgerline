'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetImportBatch extends Model {
    static associate(models) {
      AssetImportBatch.hasMany(models.AssetImportItem, { foreignKey: 'batch_id', as: 'items' });
      AssetImportBatch.belongsTo(models.User, { foreignKey: 'uploaded_by', as: 'Uploader' });
    }
  }
  AssetImportBatch.init({
    file_name: { type: DataTypes.STRING, allowNull: false },
    uploaded_by: DataTypes.INTEGER,
    status: { 
      type: DataTypes.ENUM('PENDING', 'PROCESSED', 'FAILED'), 
      defaultValue: 'PENDING' 
    }
  }, {
    sequelize,
    modelName: 'AssetImportBatch',
    tableName: 'asset_import_batches',
    freezeTableName: true,
    underscored: true
  });
  return AssetImportBatch;
};
