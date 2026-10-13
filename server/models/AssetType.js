'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetType extends Model {
    static associate(models) {
      // AssetType.hasMany(models.Asset, { foreignKey: 'asset_type_id' });
    }
  }
  AssetType.init({
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    code: { type: DataTypes.STRING, allowNull: false, unique: true },
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'AssetType',
    tableName: 'asset_types',
    freezeTableName: true,
    timestamps: true,
  });
  return AssetType;
};
