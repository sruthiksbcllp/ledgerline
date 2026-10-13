'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MovementRule extends Model {}
  MovementRule.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },
    rule_type: { 
      type: DataTypes.ENUM('RESTRICTED_LOCATION', 'AFTER_HOURS', 'DEPARTMENT_CHANGE'), 
      defaultValue: 'RESTRICTED_LOCATION' 
    },
    condition_value: { type: DataTypes.STRING(255) },
    requires_approval: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'MovementRule',
    tableName: 'movement_rules',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return MovementRule;
};
