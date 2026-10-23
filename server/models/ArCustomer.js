'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArCustomer extends Model {
    static associate(models) {
      ArCustomer.hasMany(models.ArInvoice, { foreignKey: 'customer_id', as: 'invoices' });
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
