'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArReceipt extends Model {
    static associate(models) {
      ArReceipt.belongsTo(models.ArInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
    }
  }
  ArReceipt.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    invoice_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    received_date: { type: DataTypes.DATEONLY, allowNull: false },
    payment_mode: { type: DataTypes.STRING(30), allowNull: true },
    reference: { type: DataTypes.STRING(100), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'ArReceipt',
    tableName: 'ar_receipts',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ArReceipt;
};
