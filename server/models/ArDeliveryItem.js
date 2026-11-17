'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArDeliveryItem extends Model {
    static associate(models) {
      ArDeliveryItem.belongsTo(models.ArDelivery, { foreignKey: 'delivery_id', as: 'delivery' });
      ArDeliveryItem.belongsTo(models.ArSalesOrderItem, { foreignKey: 'order_item_id', as: 'orderItem' });
    }
  }
  ArDeliveryItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    delivery_id: { type: DataTypes.INTEGER, allowNull: false },
    order_item_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false }
  }, {
    sequelize,
    modelName: 'ArDeliveryItem',
    tableName: 'ar_delivery_items',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ArDeliveryItem;
};
