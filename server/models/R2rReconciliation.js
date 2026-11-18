'use strict';
const { Model } = require('sequelize');

/**
 * A month's reconciliation (FDS section 22): the book figure from the ledger or sub-ledger against
 * the outside figure (bank statement, GSTR-1 filed). rec_type: BANK | GST
 * Customer reconciliation comes from the statements and replies (ar_statements).
 */
module.exports = (sequelize, DataTypes) => {
  class R2rReconciliation extends Model {}
  R2rReconciliation.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.STRING(7), allowNull: false },
    rec_type: { type: DataTypes.STRING(20), allowNull: false },
    book_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    statement_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    difference: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    note: { type: DataTypes.STRING(500), allowNull: true },
    prepared_by: { type: DataTypes.INTEGER, allowNull: true },
    prepared_at: { type: DataTypes.DATE, allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize, modelName: 'R2rReconciliation', tableName: 'r2r_reconciliations', freezeTableName: true, underscored: true, timestamps: true
  });
  return R2rReconciliation;
};
