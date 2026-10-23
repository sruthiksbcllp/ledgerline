'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SLARule extends Model {}
  SLARule.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },
    alert_type: { type: DataTypes.STRING(50) },
    priority: { type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') },
    max_response_time_minutes: { type: DataTypes.INTEGER },
    escalate_to: { type: DataTypes.INTEGER },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'SLARule',
    tableName: 'sla_rules',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return SLARule;
};
