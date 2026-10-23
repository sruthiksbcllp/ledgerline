'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArInvoice extends Model {
    static associate(models) {
      ArInvoice.belongsTo(models.ArCustomer, { foreignKey: 'customer_id', as: 'customer' });
      ArInvoice.hasMany(models.ArReceipt, { foreignKey: 'invoice_id', as: 'receipts' });
      ArInvoice.hasMany(models.ArReminder, { foreignKey: 'invoice_id', as: 'reminders' });
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
    status: { type: DataTypes.ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'), allowNull: false, defaultValue: 'UNPAID' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    source: { type: DataTypes.ENUM('MANUAL', 'AI_EXTRACTED'), allowNull: false, defaultValue: 'MANUAL' },
    source_file_name: { type: DataTypes.STRING(255), allowNull: true },
    last_reminder_at: { type: DataTypes.DATE, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    outstanding: {
      type: DataTypes.VIRTUAL,
      get() {
        return Math.max(0, Number(this.total_amount || 0) - Number(this.amount_received || 0));
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
