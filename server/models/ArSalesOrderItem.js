'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArSalesOrderItem extends Model {
    static associate(models) {
      ArSalesOrderItem.belongsTo(models.ArSalesOrder, { foreignKey: 'order_id', as: 'order' });
    }
  }
  ArSalesOrderItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    order_id: { type: DataTypes.INTEGER, allowNull: false },
    line_no: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    description: { type: DataTypes.STRING(500), allowNull: false },
    hsn_code: { type: DataTypes.STRING(20), allowNull: true },
    unit: { type: DataTypes.STRING(20), allowNull: true },
    quantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false },
    rate: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    gst_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    delivered_qty: { type: DataTypes.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
    invoiced_qty: { type: DataTypes.DECIMAL(15, 3), allowNull: false, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'ArSalesOrderItem',
    tableName: 'ar_sales_order_items',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ArSalesOrderItem;
};
