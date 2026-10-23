'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetStatus extends Model {
    static associate(models) {
      AssetStatus.hasMany(models.Asset, { foreignKey: 'status_id' });
    }
  }
  AssetStatus.init({
    code: { type: DataTypes.STRING(30) },
    status_name: { type: DataTypes.STRING, allowNull: false },
    status_color: DataTypes.STRING(7),
    description: DataTypes.TEXT,
    display_order: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AssetStatus',
    tableName: 'asset_statuses',
    freezeTableName: true,
    timestamps: true,
  });
  return AssetStatus;
};
