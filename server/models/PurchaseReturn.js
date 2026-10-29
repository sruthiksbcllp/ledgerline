'use strict';
const { Model } = require('sequelize');

/**
 * Goods sent back to the vendor against a GRN. BEFORE_INVOICE returns reverse the receipt (GR/IR);
 * AFTER_INVOICE returns reduce the booked invoice and await the vendor's credit note.
 */
module.exports = (sequelize, DataTypes) => {
  class PurchaseReturn extends Model {
    static associate(models) {
      PurchaseReturn.hasMany(models.PurchaseReturnItem, { foreignKey: 'return_id', as: 'items', onDelete: 'CASCADE' });
      PurchaseReturn.belongsTo(models.GRN, { foreignKey: 'grn_id', as: 'grn' });
      PurchaseReturn.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id', as: 'po' });
      PurchaseReturn.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
      PurchaseReturn.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice' });
    }
  }
  PurchaseReturn.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    return_number: { type: DataTypes.STRING(50), allowNull: false },
    grn_id: { type: DataTypes.INTEGER, allowNull: false },
    po_id: { type: DataTypes.INTEGER, allowNull: true },
    vendor_id: { type: DataTypes.INTEGER, allowNull: true },
    invoice_id: { type: DataTypes.INTEGER, allowNull: true },
    stage: { type: DataTypes.STRING(20), allowNull: false },
    return_date: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    total_value: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    gst_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(30), allowNull: false },
    credit_note_number: { type: DataTypes.STRING(100), allowNull: true },
    credit_note_date: { type: DataTypes.DATEONLY, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    created_by_name: { type: DataTypes.STRING(150), allowNull: true }
  }, {
    sequelize,
    modelName: 'PurchaseReturn',
    tableName: 'purchase_returns',
    freezeTableName: true,
    underscored: true
  });
  return PurchaseReturn;
};
