'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Item extends Model {
    static associate(models) {
      Item.belongsTo(models.AssetCategory, { foreignKey: 'category_id' });
      Item.belongsTo(models.AssetSubCategory, { foreignKey: 'sub_category_id' });
      Item.hasMany(models.StockTransaction, { foreignKey: 'item_id' });
      Item.hasMany(models.InventoryBalance, { foreignKey: 'item_id' });
    }
  }
  Item.init({
    item_name: { type: DataTypes.STRING, allowNull: false },
    sku_code: { type: DataTypes.STRING, unique: true, allowNull: false },
    category_id: DataTypes.INTEGER,
    sub_category_id: DataTypes.INTEGER,
    unit: { 
      type: DataTypes.ENUM('Nos', 'Kg', 'Liters', 'Meters', 'Pack'), 
      defaultValue: 'Nos' 
    },
    min_stock_level: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    reorder_level: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
    item_type: { 
      type: DataTypes.ENUM('INVENTORY', 'FIXED_ASSET'), 
      defaultValue: 'INVENTORY' 
    },

    item_description: DataTypes.TEXT,
    qr_code: DataTypes.STRING, // URL or path to generated QR image
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    }

  }, {

    sequelize,
    modelName: 'Item',
    tableName: 'items',
    freezeTableName: true,
    timestamps: true,
  });
  return Item;
};
