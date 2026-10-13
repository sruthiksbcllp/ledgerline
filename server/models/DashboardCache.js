'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DashboardCache extends Model {
    static associate(models) {
    }
  }
  DashboardCache.init({
    cache_key: { type: DataTypes.STRING, unique: true },
    value: DataTypes.JSON,
    updated_at: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    modelName: 'DashboardCache',
    tableName: 'dashboard_caches',
    freezeTableName: true,
    timestamps: false,
    underscored: true
  });
  return DashboardCache;
};
