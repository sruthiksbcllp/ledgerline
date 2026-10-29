'use strict';
const { Model } = require('sequelize');

/** One GRN line sent back on a purchase return, valued at the PO unit price. */
module.exports = (sequelize, DataTypes) => {
  class PurchaseReturnItem extends Model {
    static associate(models) {
      PurchaseReturnItem.belongsTo(models.PurchaseReturn, { foreignKey: 'return_id', as: 'purchaseReturn' });
    }
  }
  PurchaseReturnItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    return_id: { type: DataTypes.INTEGER, allowNull: false },
    grn_item_id: { type: DataTypes.INTEGER, allowNull: false },
    po_item_id: { type: DataTypes.INTEGER, allowNull: true },
    item_name: { type: DataTypes.STRING(255), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    unit_price: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'PurchaseReturnItem',
    tableName: 'purchase_return_items',
    freezeTableName: true,
    underscored: true
  });
  return PurchaseReturnItem;
};
