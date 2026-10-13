'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditSession extends Model {
    static associate(models) {
      AuditSession.belongsTo(models.Property, { foreignKey: 'property_id' });
      AuditSession.belongsTo(models.Location, { foreignKey: 'location_id' });
      AuditSession.belongsTo(models.Department, { foreignKey: 'department_id' });
      AuditSession.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
      AuditSession.belongsTo(models.User, { foreignKey: 'reviewer_id', as: 'Reviewer' });
      AuditSession.belongsTo(models.User, { foreignKey: 'auditor_id', as: 'Auditor' });
      AuditSession.hasMany(models.AuditAsset, { foreignKey: 'audit_session_id', as: 'ExpectedAssets' });
      AuditSession.hasMany(models.AuditScan, { foreignKey: 'audit_session_id', as: 'Scans' });
      AuditSession.hasMany(models.AuditResult, { foreignKey: 'audit_session_id', as: 'Results' });
      AuditSession.belongsTo(models.AuditPlanning, { foreignKey: 'plan_id', as: 'Plan' });
    }
  }
  AuditSession.init({
    plan_id: { type: DataTypes.INTEGER, allowNull: true },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },
    audit_name: { type: DataTypes.STRING, allowNull: false },
    location_id: { type: DataTypes.INTEGER, allowNull: true },
    auditor_id: { type: DataTypes.INTEGER, allowNull: true },
    department_id: DataTypes.INTEGER,
    status: {
      type: DataTypes.ENUM('PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'REVIEW', 'CLOSED', 'REJECTED', 'CANCELLED'),
      defaultValue: 'PLANNED'
    },
    // expected_assets_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    // scanned_assets_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    property_id: DataTypes.INTEGER,
    planned_start_date: DataTypes.DATE,
    planned_end_date: DataTypes.DATE,
    actual_start_date: DataTypes.DATE,
    actual_end_date: DataTypes.DATE,
    // start_date: DataTypes.DATE, // Keep for backward compat
    // end_date: DataTypes.DATE,   // Keep for backward compat
    created_by: DataTypes.INTEGER,
    reviewer_id: DataTypes.INTEGER,
    approval_remarks: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'AuditSession',
    tableName: 'audit_sessions',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  });
  return AuditSession;
};
