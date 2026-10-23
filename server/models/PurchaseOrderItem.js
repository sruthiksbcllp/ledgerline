const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class PurchaseOrderItem extends Model {
    static associate(models) {
      PurchaseOrderItem.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
    }
  }

  PurchaseOrderItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    },

    po_id: { type: DataTypes.INTEGER, allowNull: false },

    item_id: { type: DataTypes.INTEGER, allowNull: true },
    item_name: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    received_quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    unit_price: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    total_price: { type: DataTypes.DECIMAL(15, 2), allowNull: false }
  }, {
    sequelize,
    modelName: 'PurchaseOrderItem',
    tableName: 'purchase_order_items',
    freezeTableName: true,
    underscored: true
  });

  return PurchaseOrderItem;
};
