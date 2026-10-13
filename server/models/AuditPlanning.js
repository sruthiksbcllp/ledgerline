'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditPlanning extends Model {
    static associate(models) {
      AuditPlanning.belongsTo(models.Property, { foreignKey: 'property_id' });
      AuditPlanning.belongsTo(models.Location, { foreignKey: 'location_id' });
      AuditPlanning.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
      AuditPlanning.belongsTo(models.User, { foreignKey: 'auditor_id', as: 'Auditor' });
      AuditPlanning.hasMany(models.AuditSession, { foreignKey: 'plan_id', as: 'Sessions' });
    }
  }
  AuditPlanning.init({
    audit_name: { type: DataTypes.STRING, allowNull: false },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },
    property_id: DataTypes.INTEGER,
    location_id: DataTypes.INTEGER,
    start_date: DataTypes.DATE,
    end_date: DataTypes.DATE,
    frequency: { type: DataTypes.ENUM('ANNUAL', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY'), defaultValue: 'ANNUAL' },
    risk_level: { type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'), defaultValue: 'LOW' },
    multi_locations: DataTypes.JSON,
    auditor_id: DataTypes.INTEGER,
    status: { 
      type: DataTypes.ENUM('PLANNED', 'SCHEDULED', 'COMPLETED'), 
      defaultValue: 'PLANNED' 
    },
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AuditPlanning',
    tableName: 'audit_plannings',
    freezeTableName: true,
    underscored: true
  });
  return AuditPlanning;
};
