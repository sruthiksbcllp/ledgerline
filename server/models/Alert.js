'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Alert extends Model {
    static associate(models) {
      Alert.belongsTo(models.User, { as: 'Assignee', foreignKey: 'assigned_to' });
      Alert.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
      Alert.hasMany(models.AlertAction, { foreignKey: 'alert_id', as: 'Actions' });
    }
  }
  Alert.init({
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    alert_type: {
      type: DataTypes.ENUM('UNKNOWN_TAG', 'MOVEMENT', 'AUDIT', 'SYSTEM', 'SLA'),
      allowNull: false
    },
    severity: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      defaultValue: 'MEDIUM'
    },
    source_module: {
      type: DataTypes.ENUM('ASSET', 'AUDIT', 'INVENTORY', 'SYSTEM'),
      allowNull: false
    },
    reference_id: DataTypes.INTEGER,
    title: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    status: {
      type: DataTypes.ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED'),
      defaultValue: 'OPEN'
    },
    assigned_to: DataTypes.INTEGER,
    created_by: DataTypes.INTEGER,
    resolved_at: DataTypes.DATE,

    // SLA Fields
    due_at: DataTypes.DATE,
    is_sla_breached: { type: DataTypes.BOOLEAN, defaultValue: false }
  }, {
    sequelize,
    modelName: 'Alert',
    tableName: 'alerts',
    freezeTableName: true,
    underscored: true
  });
  return Alert;
};
