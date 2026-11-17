'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArDelivery extends Model {
    static associate(models) {
      ArDelivery.belongsTo(models.ArSalesOrder, { foreignKey: 'order_id', as: 'order' });
      ArDelivery.belongsTo(models.ArCustomer, { foreignKey: 'customer_id', as: 'customer' });
      ArDelivery.hasMany(models.ArDeliveryItem, { foreignKey: 'delivery_id', as: 'items' });
      ArDelivery.belongsTo(models.ArInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
    }
  }
  ArDelivery.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    order_id: { type: DataTypes.INTEGER, allowNull: false },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    delivery_number: { type: DataTypes.STRING(60), allowNull: false },
    // DISPATCHED -> DELIVERED (proof of delivery recorded); CANCELLED
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DISPATCHED' },
    dispatch_date: { type: DataTypes.DATEONLY, allowNull: false },
    transporter: { type: DataTypes.STRING(150), allowNull: true },
    vehicle_number: { type: DataTypes.STRING(30), allowNull: true },
    tracking_reference: { type: DataTypes.STRING(100), allowNull: true },
    delivered_date: { type: DataTypes.DATEONLY, allowNull: true },
    received_by: { type: DataTypes.STRING(150), allowNull: true },
    delivery_note: { type: DataTypes.STRING(255), allowNull: true },
    invoice_id: { type: DataTypes.INTEGER, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'ArDelivery',
    tableName: 'ar_deliveries',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ArDelivery;
};
