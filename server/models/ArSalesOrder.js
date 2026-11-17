'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArSalesOrder extends Model {
    static associate(models) {
      ArSalesOrder.belongsTo(models.ArCustomer, { foreignKey: 'customer_id', as: 'customer' });
      ArSalesOrder.hasMany(models.ArSalesOrderItem, { foreignKey: 'order_id', as: 'items' });
      ArSalesOrder.hasMany(models.ArDelivery, { foreignKey: 'order_id', as: 'deliveries' });
      ArSalesOrder.hasMany(models.ArInvoice, { foreignKey: 'sales_order_id', as: 'invoices' });
    }
  }
  ArSalesOrder.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    quotation_number: { type: DataTypes.STRING(60), allowNull: true },
    order_number: { type: DataTypes.STRING(60), allowNull: true },
    // QUOTATION -> (credit check) -> CREDIT_HOLD | CONFIRMED -> PARTIALLY_DELIVERED -> DELIVERED -> CLOSED (fully invoiced); CANCELLED
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'QUOTATION' },
    order_date: { type: DataTypes.DATEONLY, allowNull: false },
    valid_until: { type: DataTypes.DATEONLY, allowNull: true },
    customer_po_number: { type: DataTypes.STRING(100), allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    tax_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    credit_check: { type: DataTypes.JSON, allowNull: true },
    credit_released_by: { type: DataTypes.INTEGER, allowNull: true },
    credit_released_at: { type: DataTypes.DATE, allowNull: true },
    credit_release_note: { type: DataTypes.STRING(255), allowNull: true },
    confirmed_at: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MANUAL' },
    source_file_name: { type: DataTypes.STRING(255), allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'ArSalesOrder',
    tableName: 'ar_sales_orders',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ArSalesOrder;
};
