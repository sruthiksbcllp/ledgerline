'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CwipAsset extends Model {
    static associate(models) {
      CwipAsset.belongsTo(models.Invoice, { foreignKey: 'invoice_id' });
      CwipAsset.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      CwipAsset.belongsTo(models.Property, { foreignKey: 'property_id' });
      CwipAsset.belongsTo(models.Asset, { foreignKey: 'capitalized_asset_id' });
    }
  }

  CwipAsset.init({
    cwip_number: { type: DataTypes.STRING, unique: true },
    invoice_id: { type: DataTypes.INTEGER, allowNull: false },
    po_id: { type: DataTypes.INTEGER, allowNull: false },
    property_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    aging_days: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('PARKED', 'CAPITALIZED'),
      defaultValue: 'PARKED'
    },
    put_to_use_date: DataTypes.DATE,
    capitalized_asset_id: DataTypes.INTEGER,
    capitalized_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'CwipAsset',
    tableName: 'cwipassets',
    freezeTableName: true
  });

  return CwipAsset;
};
