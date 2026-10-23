'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockTransaction extends Model {
    static associate(models) {
      StockTransaction.belongsTo(models.Item, { foreignKey: 'item_id' });
      StockTransaction.belongsTo(models.Location, { foreignKey: 'from_location_id', as: 'FromLocation' });
      StockTransaction.belongsTo(models.Location, { foreignKey: 'to_location_id', as: 'ToLocation' });
      StockTransaction.belongsTo(models.User, { foreignKey: 'created_by' });
      StockTransaction.belongsTo(models.Vendor, { foreignKey: 'supplier_id' });
    }
  }
  StockTransaction.init({
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },

    transaction_type: { 
      type: DataTypes.ENUM('GRN', 'ISSUE', 'TRANSFER', 'ADJUSTMENT'), 
      allowNull: false 
    },
    quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    unit_cost: DataTypes.DECIMAL(15, 2),
    batch_number: DataTypes.STRING,
    serial_number: DataTypes.STRING,
    from_location_id: DataTypes.INTEGER,
    to_location_id: DataTypes.INTEGER,
    supplier_id: DataTypes.INTEGER,
    reference_number: DataTypes.STRING, // Invoice No, Issue Slip No, etc.
    notes: DataTypes.TEXT,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'StockTransaction',
    tableName: 'stocktransactions',
    freezeTableName: true,
    timestamps: true,
  });
  return StockTransaction;
};
