'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ComplianceCalendar', {
    client_id: DataTypes.INTEGER,
    obligation_name: { type: DataTypes.STRING, allowNull: false },
    obligation_type: { type: DataTypes.ENUM('IND_AS_16','SCHEDULE_VI','ITR_FA','CARO','CUSTOM'), allowNull: false },
    due_date: { type: DataTypes.DATEONLY, allowNull: false },
    frequency: { type: DataTypes.ENUM('MONTHLY','QUARTERLY','ANNUALLY','ONE_TIME'), defaultValue: 'ANNUALLY' },
    status: { type: DataTypes.ENUM('PENDING','COMPLETED','OVERDUE'), defaultValue: 'PENDING' },
    completed_date: DataTypes.DATEONLY,
    completed_by: DataTypes.INTEGER,
    reminder_days_before: { type: DataTypes.INTEGER, defaultValue: 30 },
    notes: DataTypes.TEXT
  }, { tableName: 'compliance_calendar', timestamps: true, underscored: true });
};
