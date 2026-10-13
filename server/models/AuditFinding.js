'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('AuditFinding', {
    client_id: DataTypes.INTEGER,
    audit_plan_id: DataTypes.INTEGER,
    asset_id: DataTypes.INTEGER,
    finding_type: { type: DataTypes.ENUM('OBSERVATION','EXCEPTION','NON_COMPLIANCE','RECOMMENDATION'), defaultValue: 'OBSERVATION' },
    severity: { type: DataTypes.ENUM('LOW','MEDIUM','HIGH','CRITICAL'), defaultValue: 'MEDIUM' },
    title: { type: DataTypes.STRING(500), allowNull: false },
    description: DataTypes.TEXT,
    recommendation: DataTypes.TEXT,
    management_response: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED','DEFERRED'), defaultValue: 'OPEN' },
    due_date: DataTypes.DATEONLY,
    resolved_date: DataTypes.DATEONLY,
    assigned_to: DataTypes.INTEGER,
    created_by: DataTypes.INTEGER
  }, { tableName: 'audit_findings', timestamps: true, underscored: true });
};
