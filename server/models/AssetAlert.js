'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetAlert extends Model {
    static associate(models) {
      AssetAlert.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AssetAlert.belongsTo(models.Location, { foreignKey: 'location_id' });
      AssetAlert.belongsTo(models.User, { foreignKey: 'assigned_to', as: 'Assignee' });
      AssetAlert.hasMany(models.AlertAction, { foreignKey: 'alert_id', as: 'Actions' });
    }
  }
  AssetAlert.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    alert_type: { type: DataTypes.STRING(50), allowNull: false },
    severity: { type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), defaultValue: 'MEDIUM' },
    message: { type: DataTypes.TEXT },
    asset_id: { type: DataTypes.INTEGER },
    location_id: { type: DataTypes.INTEGER },
    scanner_id: { type: DataTypes.STRING(50) },
    status: {
      type: DataTypes.ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED'),
      defaultValue: 'OPEN'
    },
    assigned_to: { type: DataTypes.INTEGER },
    priority: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      defaultValue: 'MEDIUM'
    },
    reference_id: { type: DataTypes.INTEGER, allowNull: true },
    property_id: { type: DataTypes.INTEGER, allowNull: true },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },
    resolved_at: { type: DataTypes.DATE },
    trigger_date: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'AssetAlert',
    tableName: 'asset_alerts',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return AssetAlert;
};
