'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ApInvoiceLine extends Model {
    static associate(models) {
      ApInvoiceLine.belongsTo(models.Invoice, { foreignKey: 'invoice_id' });
    }
  }
  ApInvoiceLine.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    invoice_id: { type: DataTypes.INTEGER, allowNull: false },
    line_no: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(15, 3), allowNull: true },
    unit_price: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    tax_rate_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true }
  }, {
    sequelize,
    modelName: 'ApInvoiceLine',
    tableName: 'ap_invoice_lines',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ApInvoiceLine;
};
