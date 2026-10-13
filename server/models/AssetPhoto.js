'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetPhoto extends Model {
    static associate(models) {
      AssetPhoto.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AssetPhoto.belongsTo(models.User, { as: 'Uploader', foreignKey: 'uploaded_by' });
    }
  }
  AssetPhoto.init({
    asset_id:    { type: DataTypes.INTEGER, allowNull: false },
    context:     { type: DataTypes.ENUM('INWARD','AUDIT','ISSUE','DISPOSAL','GENERAL'), defaultValue: 'GENERAL' },
    photo_url:   { type: DataTypes.STRING(500), allowNull: false },
    filename:    { type: DataTypes.STRING(255), allowNull: false },
    caption:     DataTypes.STRING(255),
    latitude:    DataTypes.DECIMAL(10, 7),
    longitude:   DataTypes.DECIMAL(10, 7),
    uploaded_by: DataTypes.INTEGER,
    client_id:   { type: DataTypes.INTEGER, allowNull: false },
    created_at:  DataTypes.DATE
  }, {
    sequelize,
    modelName: 'AssetPhoto',
    tableName: 'assetphotos',
    freezeTableName: true,
    timestamps: false
  });
  return AssetPhoto;
};
