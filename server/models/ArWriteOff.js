'use strict';
const { Model } = require('sequelize');

/**
 * Bad-debt write-off (blueprint O2C step 9). Requested with a reason, evidence and the collection
 * history; approved within the write-off limit by someone other than the requester. Posted against
 * the credit-loss allowance (1105), with any excess to credit-loss expense (6900). A later recovery
 * reinstates the receivable so the cash can be received normally.
 * PENDING_APPROVAL -> APPROVED | REJECTED
 */
module.exports = (sequelize, DataTypes) => {
  class ArWriteOff extends Model {
    static associate(models) {
      ArWriteOff.belongsTo(models.ArInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
      ArWriteOff.belongsTo(models.ArCustomer, { foreignKey: 'customer_id', as: 'customer' });
    }
  }
  // A fresh definition per column: Sequelize writes the column name into the object it is given.
  const money = () => ({ type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
  ArWriteOff.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    invoice_id: { type: DataTypes.INTEGER, allowNull: false },
    write_off_number: { type: DataTypes.STRING(60), allowNull: true },
    amount: money(),
    reason: { type: DataTypes.STRING(500), allowNull: false },
    evidence_url: { type: DataTypes.STRING(500), allowNull: true },
    evidence_name: { type: DataTypes.STRING(255), allowNull: true },
    collection_summary: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING_APPROVAL' },
    requested_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    decision_note: { type: DataTypes.STRING(500), allowNull: true },
    allowance_used: money(),
    expense_amount: money(),
    recovered_amount: money()
  }, {
    sequelize, modelName: 'ArWriteOff', tableName: 'ar_write_offs', freezeTableName: true, underscored: true, timestamps: true
  });
  return ArWriteOff;
};
