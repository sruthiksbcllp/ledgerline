'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArInvoice extends Model {
    static associate(models) {
      ArInvoice.belongsTo(models.ArCustomer, { foreignKey: 'customer_id', as: 'customer' });
      ArInvoice.hasMany(models.ArReceipt, { foreignKey: 'invoice_id', as: 'receipts' });
      ArInvoice.hasMany(models.ArReminder, { foreignKey: 'invoice_id', as: 'reminders' });
      ArInvoice.hasMany(models.ArPromise, { foreignKey: 'invoice_id', as: 'promises' });
      ArInvoice.belongsTo(models.ArSalesOrder, { foreignKey: 'sales_order_id', as: 'salesOrder' });
      ArInvoice.hasMany(models.ArCreditNote, { foreignKey: 'invoice_id', as: 'creditNotes' });
      ArInvoice.hasMany(models.ArWriteOff, { foreignKey: 'invoice_id', as: 'writeOffs' });
    }
  }
  ArInvoice.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    invoice_number: { type: DataTypes.STRING(100), allowNull: false },
    invoice_date: { type: DataTypes.DATEONLY, allowNull: false },
    due_date: { type: DataTypes.DATEONLY, allowNull: true },
    customer_po_number: { type: DataTypes.STRING(100), allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    tax_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    amount_received: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'WRITTEN_OFF'), allowNull: false, defaultValue: 'UNPAID' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    source: { type: DataTypes.ENUM('MANUAL', 'AI_EXTRACTED'), allowNull: false, defaultValue: 'MANUAL' },
    source_file_name: { type: DataTypes.STRING(255), allowNull: true },
    last_reminder_at: { type: DataTypes.DATE, allowNull: true },
    sales_order_id: { type: DataTypes.INTEGER, allowNull: true },
    delivery_id: { type: DataTypes.INTEGER, allowNull: true },
    cgst_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    sgst_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    igst_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    tds_deducted: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 }, // TDS the customer withheld; settles the invoice like cash
    line_items: { type: DataTypes.JSON, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    // An invoice raised with no sales order / delivery says why (blueprint: invoice against a delivery)
    direct_reason: { type: DataTypes.STRING(255), allowNull: true },
    // e-invoice (IRN from the IRP) and e-way bill, entered by hand
    irn: { type: DataTypes.STRING(64), allowNull: true },
    irn_ack_number: { type: DataTypes.STRING(30), allowNull: true },
    irn_ack_date: { type: DataTypes.DATEONLY, allowNull: true },
    eway_bill_number: { type: DataTypes.STRING(20), allowNull: true },
    // Settled other than by cash and TDS: approved credit notes, early-payment discount, write-offs
    credited_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    discount_allowed: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    written_off_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    outstanding: {
      type: DataTypes.VIRTUAL,
      get() {
        return Math.max(0, Number(this.total_amount || 0) - Number(this.amount_received || 0) - Number(this.tds_deducted || 0)
          - Number(this.credited_amount || 0) - Number(this.discount_allowed || 0) - Number(this.written_off_amount || 0));
      }
    }
  }, {
    sequelize,
    modelName: 'ArInvoice',
    tableName: 'ar_invoices',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ArInvoice;
};
