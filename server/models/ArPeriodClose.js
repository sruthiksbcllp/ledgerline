'use strict';
const { Model } = require('sequelize');

/**
 * Month-end AR close (blueprint O2C step 10; "Close AR" in the FDS period close). Accounts
 * Receivable closes the month once the checklist is clear; Finance or the Director / CFO (a different
 * person) signs it off. While CLOSED or SIGNED_OFF, no AR posting dated in the month is accepted.
 * OPEN -> CLOSED -> SIGNED_OFF; REOPENED (Director / CFO or admin, with a reason) works like OPEN.
 */
module.exports = (sequelize, DataTypes) => {
  class ArPeriodClose extends Model {}
  ArPeriodClose.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.STRING(7), allowNull: false }, // YYYY-MM
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'OPEN' },
    checklist: { type: DataTypes.JSON, allowNull: true }, // snapshot of the checks when it was closed
    closed_by: { type: DataTypes.INTEGER, allowNull: true },
    closed_at: { type: DataTypes.DATE, allowNull: true },
    signed_off_by: { type: DataTypes.INTEGER, allowNull: true },
    signed_off_at: { type: DataTypes.DATE, allowNull: true },
    reopened_by: { type: DataTypes.INTEGER, allowNull: true },
    reopened_at: { type: DataTypes.DATE, allowNull: true },
    reopen_reason: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    sequelize, modelName: 'ArPeriodClose', tableName: 'ar_period_closes', freezeTableName: true, underscored: true, timestamps: true
  });
  return ArPeriodClose;
};
