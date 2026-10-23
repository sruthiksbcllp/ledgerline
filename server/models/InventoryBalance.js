'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InventoryBalance extends Model {
    static associate(models) {
      InventoryBalance.belongsTo(models.Item, { foreignKey: 'item_id' });
      InventoryBalance.belongsTo(models.Location, { foreignKey: 'location_id' });
    }
  }
  InventoryBalance.init({
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    location_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'InventoryBalance',
    tableName: 'inventorybalances',
    freezeTableName: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['item_id', 'location_id'] }
    ]
  });
  return InventoryBalance;
};
