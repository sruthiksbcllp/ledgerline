'use strict';
const { Model } = require('sequelize');

/** One document captured from email: the file, its email, what the AI read and the review outcome. */
module.exports = (sequelize, DataTypes) => {
  class BillInboxItem extends Model {
    static associate(models) {
      BillInboxItem.belongsTo(models.BillInboxSource, { foreignKey: 'source_id', as: 'source', constraints: false });
      BillInboxItem.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'vendor', constraints: false });
      BillInboxItem.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id', as: 'purchaseOrder', constraints: false });
      BillInboxItem.belongsTo(models.Department, { foreignKey: 'department_id', as: 'department', constraints: false });
      BillInboxItem.belongsTo(models.User, { foreignKey: 'requested_by_user_id', as: 'requester', constraints: false });
      BillInboxItem.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice', constraints: false });
      BillInboxItem.belongsTo(models.PurchaseReturn, { foreignKey: 'purchase_return_id', as: 'purchaseReturn', constraints: false });
    }
  }
  BillInboxItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    source_id: { type: DataTypes.INTEGER, allowNull: true },
    channel: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'EMAIL' },
    email_from: { type: DataTypes.STRING(255), allowNull: true },
    email_from_name: { type: DataTypes.STRING(255), allowNull: true },
    email_subject: { type: DataTypes.STRING(500), allowNull: true },
    received_at: { type: DataTypes.DATE, allowNull: true },
    web_link: { type: DataTypes.TEXT, allowNull: true },
    file_name: { type: DataTypes.STRING(255), allowNull: true },
    content_type: { type: DataTypes.STRING(100), allowNull: true },
    file_size: { type: DataTypes.INTEGER, allowNull: true },
    file_hash: { type: DataTypes.STRING(64), allowNull: false },
    storage_key: { type: DataTypes.STRING(300), allowNull: true },
    document_type: { type: DataTypes.STRING(30), allowNull: true },
    extraction: { type: DataTypes.JSON, allowNull: true },
    party_name: { type: DataTypes.STRING(255), allowNull: true },
    invoice_number: { type: DataTypes.STRING(100), allowNull: true },
    invoice_date: { type: DataTypes.DATEONLY, allowNull: true },
    total_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    vendor_id: { type: DataTypes.INTEGER, allowNull: true },
    vendor_matched_by: { type: DataTypes.STRING(20), allowNull: true },
    po_id: { type: DataTypes.INTEGER, allowNull: true },
    po_matched_by: { type: DataTypes.STRING(20), allowNull: true },
    department_id: { type: DataTypes.INTEGER, allowNull: true },
    requested_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    duplicate_invoice_id: { type: DataTypes.INTEGER, allowNull: true },
    possible_duplicate_invoice_id: { type: DataTypes.INTEGER, allowNull: true },
    purchase_return_id: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'NEW' },
    status_reason: { type: DataTypes.STRING(500), allowNull: true },
    error: { type: DataTypes.STRING(500), allowNull: true },
    invoice_id: { type: DataTypes.INTEGER, allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    // Clean-bill test: { clean: boolean, reasons: string[], checked_at }
    auto_check: { type: DataTypes.JSON, allowNull: true },
    auto_submitted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    spot_check: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
  }, {
    sequelize,
    modelName: 'BillInboxItem',
    tableName: 'bill_inbox_items',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return BillInboxItem;
};
