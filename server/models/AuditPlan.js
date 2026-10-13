'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditPlan extends Model {
    static associate(models) {
      AuditPlan.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AuditPlan.belongsTo(models.User, { as: 'Auditor', foreignKey: 'auditor_id' });
      AuditPlan.belongsTo(models.Location, { foreignKey: 'location_id' });
      AuditPlan.belongsTo(models.Department, { foreignKey: 'department_id' });
    }
  }
  AuditPlan.init({
    plan_name: { type: DataTypes.STRING(255), allowNull: false },
    location_id: { type: DataTypes.INTEGER, allowNull: false },
    frequency: { type: DataTypes.ENUM('ANNUAL', 'QUARTERLY', 'MONTHLY'), defaultValue: 'ANNUAL' },
    risk_level: { type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'), defaultValue: 'LOW' },
    assigned_to: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('PLANNED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'), defaultValue: 'PLANNED' },
    created_by: DataTypes.INTEGER,
    remarks: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'AuditPlan',
    tableName: 'auditplans',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  });
  return AuditPlan;
};
