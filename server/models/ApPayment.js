'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ApPayment extends Model {
    static associate(models) {
      ApPayment.belongsTo(models.Invoice, { foreignKey: 'invoice_id' });
    }
  }
  ApPayment.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    invoice_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    discount_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 }, // cash discount accepted by the vendor with this payment
    payment_date: { type: DataTypes.DATEONLY, allowNull: false },
    payment_mode: { type: DataTypes.STRING(30), allowNull: true },
    reference: { type: DataTypes.STRING(100), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'ApPayment',
    tableName: 'ap_payments',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ApPayment;
};
