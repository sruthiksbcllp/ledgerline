'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArPromise extends Model {
    static associate(models) {
      ArPromise.belongsTo(models.ArInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
    }
  }
  ArPromise.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    invoice_id: { type: DataTypes.INTEGER, allowNull: false },
    promised_date: { type: DataTypes.DATEONLY, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    note: { type: DataTypes.STRING(255), allowNull: true },
    // OPEN -> KEPT (paid by the date) | BROKEN (date passed, still unpaid) | CANCELLED
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'OPEN' },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'ArPromise',
    tableName: 'ar_promises',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ArPromise;
};
