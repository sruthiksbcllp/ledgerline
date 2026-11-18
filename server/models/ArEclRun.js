'use strict';
const { Model } = require('sequelize');

/**
 * One month-end expected-credit-loss calculation: ageing x loss rates (+ specific reserves) gives the
 * required allowance; the difference from the 1105 balance is the top-up (or release). Prepared by
 * Accounts Receivable, approved by Finance or the Director / CFO (not the preparer), then posted.
 * PENDING_APPROVAL -> POSTED | REJECTED
 */
module.exports = (sequelize, DataTypes) => {
  class ArEclRun extends Model {}
  ArEclRun.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.STRING(7), allowNull: false }, // YYYY-MM
    as_of: { type: DataTypes.DATEONLY, allowNull: false },
    buckets: { type: DataTypes.JSON, allowNull: true },
    required: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    existing: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    adjustment: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING_APPROVAL' },
    prepared_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    decision_note: { type: DataTypes.STRING(500), allowNull: true },
    journal_entry_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize, modelName: 'ArEclRun', tableName: 'ar_ecl_runs', freezeTableName: true, underscored: true, timestamps: true
  });
  return ArEclRun;
};
