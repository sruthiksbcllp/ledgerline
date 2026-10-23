'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class VendorEmailDraft extends Model {
    static associate(models) {
      VendorEmailDraft.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      VendorEmailDraft.belongsTo(models.Quotation, { foreignKey: 'quotation_id' });
      VendorEmailDraft.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      VendorEmailDraft.belongsTo(models.Rfq, { foreignKey: 'rfq_id' });
    }
  }
  VendorEmailDraft.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    email_type: { type: DataTypes.ENUM('RFQ_AWARD', 'PO_CONFIRMATION'), allowNull: false },
    rfq_id: { type: DataTypes.INTEGER, allowNull: true },
    quotation_id: { type: DataTypes.INTEGER, allowNull: false },
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    po_id: { type: DataTypes.INTEGER, allowNull: true },
    to_email: { type: DataTypes.STRING(255), allowNull: true },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    // Editable greeting/body text. The details table comes from `details` and is not editable.
    message: { type: DataTypes.TEXT, allowNull: false },
    details: { type: DataTypes.JSON, allowNull: false },
    attach_po_pdf: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.ENUM('DRAFT', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'), allowNull: false, defaultValue: 'DRAFT' },
    dedupe_key: { type: DataTypes.STRING(120), allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    edited_by: { type: DataTypes.INTEGER, allowNull: true },
    edited_at: { type: DataTypes.DATE, allowNull: true },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    sent_from: { type: DataTypes.STRING(255), allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    message_id: { type: DataTypes.STRING(255), allowNull: true },
    failure_reason: { type: DataTypes.STRING(500), allowNull: true },
    attempt_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'VendorEmailDraft',
    tableName: 'vendor_email_drafts',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return VendorEmailDraft;
};
