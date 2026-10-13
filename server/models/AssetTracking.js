'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetTracking extends Model {
    static associate(models) {
      AssetTracking.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AssetTracking.belongsTo(models.Location, { foreignKey: 'location_id' });
      AssetTracking.belongsTo(models.Department, { foreignKey: 'department_id' });
    }
  }
  AssetTracking.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    location_id: { type: DataTypes.INTEGER, allowNull: false },
    department_id: { type: DataTypes.INTEGER, allowNull: false },
    sub_department_id: DataTypes.INTEGER,
    region_id: DataTypes.INTEGER,
    tracking_date: DataTypes.DATE,
    status: DataTypes.STRING(50),
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AssetTracking',
    tableName: 'assettracking',
    freezeTableName: true,
    timestamps: false
  });
  return AssetTracking;
};
