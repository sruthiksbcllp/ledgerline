'use strict';
const { Model } = require('sequelize');

/**
 * Manual journal (FDS sections 19 and 27, maker-checker): prepared by one person, approved by
 * another, then posted to the ledger with source MANUAL. Must balance; control accounts (receivables,
 * payables, GR/IR, allowance, unapplied cash) are posted only by their sub-ledgers, never by hand.
 * lines: [{ account_code, account_name, debit, credit, memo }]
 * PENDING_APPROVAL -> POSTED | REJECTED
 */
module.exports = (sequelize, DataTypes) => {
  class R2rManualJournal extends Model {}
  R2rManualJournal.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    mj_number: { type: DataTypes.STRING(60), allowNull: true },
    entry_date: { type: DataTypes.DATEONLY, allowNull: false },
    narration: { type: DataTypes.STRING(500), allowNull: false },
    lines: { type: DataTypes.JSON, allowNull: false },
    total: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING_APPROVAL' },
    prepared_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    decision_note: { type: DataTypes.STRING(500), allowNull: true },
    journal_entry_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize, modelName: 'R2rManualJournal', tableName: 'r2r_manual_journals', freezeTableName: true, underscored: true, timestamps: true
  });
  return R2rManualJournal;
};
