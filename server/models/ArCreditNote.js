'use strict';
const { Model } = require('sequelize');

/**
 * Dispute and credit note (blueprint O2C step 5). The request is the dispute: it carries a reason
 * code and evidence and is linked to the original invoice. Someone other than the requester, with an
 * approval limit covering the total, approves it; only then does it get its CN- number and post.
 * PENDING_APPROVAL (in dispute) -> APPROVED (posted) | REJECTED (resolved with no credit) | CANCELLED
 */
module.exports = (sequelize, DataTypes) => {
  class ArCreditNote extends Model {
    static associate(models) {
      ArCreditNote.belongsTo(models.ArInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
      ArCreditNote.belongsTo(models.ArCustomer, { foreignKey: 'customer_id', as: 'customer' });
    }
  }
  // A fresh definition per column: Sequelize writes the column name into the object it is given.
  const money = () => ({ type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
  ArCreditNote.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    invoice_id: { type: DataTypes.INTEGER, allowNull: false },
    delivery_id: { type: DataTypes.INTEGER, allowNull: true },
    credit_note_number: { type: DataTypes.STRING(60), allowNull: true },
    reason_code: { type: DataTypes.STRING(30), allowNull: false }, // DAMAGED | PRICING | SHORT_SHIPMENT | RETURN | OTHER
    description: { type: DataTypes.TEXT, allowNull: true },
    lines: { type: DataTypes.JSON, allowNull: true },
    subtotal: money(),
    tax_amount: money(),
    cgst_amount: money(),
    sgst_amount: money(),
    igst_amount: money(),
    total_amount: money(),
    credit_date: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING_APPROVAL' },
    evidence_url: { type: DataTypes.STRING(500), allowNull: true },
    evidence_name: { type: DataTypes.STRING(255), allowNull: true },
    requested_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    decision_note: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    sequelize, modelName: 'ArCreditNote', tableName: 'ar_credit_notes', freezeTableName: true, underscored: true, timestamps: true
  });
  return ArCreditNote;
};
