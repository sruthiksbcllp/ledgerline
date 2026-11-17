'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArCustomer extends Model {
    static associate(models) {
      ArCustomer.hasMany(models.ArInvoice, { foreignKey: 'customer_id', as: 'invoices' });
      ArCustomer.hasMany(models.ArSalesOrder, { foreignKey: 'customer_id', as: 'orders' });
    }
  }
  ArCustomer.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    customer_name: { type: DataTypes.STRING(255), allowNull: false },
    gst_number: { type: DataTypes.STRING(15), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    pan: { type: DataTypes.STRING(10), allowNull: true },
    contact_person: { type: DataTypes.STRING(150), allowNull: true },
    shipping_address: { type: DataTypes.TEXT, allowNull: true },
    payment_terms_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    credit_limit: { type: DataTypes.DECIMAL(15, 2), allowNull: true }, // null = no limit set
    // PENDING (added, waiting for a second person to verify) -> ACTIVE; ON_HOLD blocks new orders; REJECTED
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    hold_reason: { type: DataTypes.STRING(255), allowNull: true },
    verified_by: { type: DataTypes.INTEGER, allowNull: true },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'ArCustomer',
    tableName: 'ar_customers',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ArCustomer;
};
