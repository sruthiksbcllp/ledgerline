const { Model, DataTypes } = require('sequelize');

/**
 * Service Entry Sheet (SES): confirms a service was performed against a PO, the way a GRN confirms
 * goods were received. Workflow (FDS section 8): Service Performed -> Service Confirmation ->
 * Manager Review -> SES Approval. Only an APPROVED SES counts as received and can be invoiced.
 */
module.exports = (sequelize) => {
  class ServiceEntrySheet extends Model {
    static associate(models) {
      this.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      this.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      this.belongsTo(models.Entity, { foreignKey: 'entity_id', as: 'Entity' });
      this.belongsTo(models.Property, { foreignKey: 'property_id' });
      this.belongsTo(models.Location, { foreignKey: 'location_id' });
      this.hasMany(models.ServiceEntrySheetItem, { foreignKey: 'ses_id', as: 'items' });
      this.hasMany(models.Invoice, { foreignKey: 'ses_id' });
      this.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
      this.belongsTo(models.User, { foreignKey: 'confirmed_by', as: 'Confirmer' });
      this.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'Reviewer' });
      this.belongsTo(models.User, { foreignKey: 'approved_by', as: 'Approver' });
      this.belongsTo(models.User, { foreignKey: 'rejected_by', as: 'Rejecter' });
    }
  }

  ServiceEntrySheet.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    ses_number: { type: DataTypes.STRING(60), allowNull: false },
    po_id: { type: DataTypes.INTEGER, allowNull: false },
    vendor_id: { type: DataTypes.INTEGER, allowNull: true },
    entity_id: { type: DataTypes.INTEGER, allowNull: true },
    property_id: { type: DataTypes.INTEGER, allowNull: true },
    location_id: { type: DataTypes.INTEGER, allowNull: true },
    service_period_from: { type: DataTypes.DATEONLY, allowNull: false },
    service_period_to: { type: DataTypes.DATEONLY, allowNull: false },
    service_description: { type: DataTypes.TEXT, allowNull: false },
    performed_by: { type: DataTypes.STRING(150), allowNull: true }, // vendor's person / team who did the work
    invoice_number: { type: DataTypes.STRING(100), allowNull: true }, // vendor invoice, invoiced on approval
    invoice_date: { type: DataTypes.DATEONLY, allowNull: true },
    invoice_document_url: { type: DataTypes.STRING(500), allowNull: true }, // vendor's bill, copied to the invoice
    total_value: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('PENDING_CONFIRMATION', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING_CONFIRMATION'
    },
    created_by: { type: DataTypes.INTEGER, allowNull: false },
    confirmed_by: { type: DataTypes.INTEGER, allowNull: true },
    confirmed_at: { type: DataTypes.DATE, allowNull: true },
    confirmation_remarks: { type: DataTypes.TEXT, allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    review_remarks: { type: DataTypes.TEXT, allowNull: true },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    approval_remarks: { type: DataTypes.TEXT, allowNull: true },
    rejected_by: { type: DataTypes.INTEGER, allowNull: true },
    rejected_at: { type: DataTypes.DATE, allowNull: true },
    rejected_stage: { type: DataTypes.STRING(30), allowNull: true },
    rejection_reason: { type: DataTypes.TEXT, allowNull: true }
  }, {
    sequelize,
    modelName: 'ServiceEntrySheet',
    tableName: 'service_entry_sheets',
    underscored: true,
    timestamps: true
  });

  return ServiceEntrySheet;
};
