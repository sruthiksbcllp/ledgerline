const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Invoice extends Model {
    static associate(models) {
      this.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      this.belongsTo(models.Entity, { foreignKey: 'entity_id', as: 'Entity' });
      this.belongsTo(models.GRN, { foreignKey: 'grn_id' });
      this.belongsTo(models.ServiceEntrySheet, { foreignKey: 'ses_id' }); // service receipt (instead of a GRN)
      this.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      this.belongsTo(models.Property, { foreignKey: 'property_id' });
      this.belongsTo(models.Location, { foreignKey: 'location_id' }); // location arc
      this.hasOne(models.ThreeWayMatch, { foreignKey: 'invoice_id' });
      this.hasMany(models.ApInvoiceLine, { foreignKey: 'invoice_id', as: 'lines' });
      this.hasMany(models.ApPayment, { foreignKey: 'invoice_id', as: 'payments' });
    }
  }

  Invoice.init({
    // Unique per company + vendor (index invoices_client_vendor_number_unique), not globally.
    invoice_number: { type: DataTypes.STRING },
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    entity_id: { type: DataTypes.INTEGER, allowNull: true }, // Phase D - buying entity
    location_id: { type: DataTypes.INTEGER, allowNull: true }, // location arc - from PO
    buyer_gstin: { type: DataTypes.STRING(15), allowNull: true }, // Phase D - place-of-supply GSTIN at booking
    property_id: { type: DataTypes.INTEGER, allowNull: false },
    ses_id: { type: DataTypes.INTEGER, allowNull: true }, // approved Service Entry Sheet, for service POs
    invoice_date: { type: DataTypes.DATE },
    base_amount: { type: DataTypes.DECIMAL(15, 2) },
    gst_amount: { type: DataTypes.DECIMAL(15, 2) },
    cgst_amount: { type: DataTypes.DECIMAL(15, 2) },
    sgst_amount: { type: DataTypes.DECIMAL(15, 2) },
    igst_amount: { type: DataTypes.DECIMAL(15, 2) },
    total_amount: { type: DataTypes.DECIMAL(15, 2) },
    tds_amount: { type: DataTypes.DECIMAL(15, 2) },
    tds_rate_percent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 2 },
    tds_section_code: { type: DataTypes.STRING(20) },
    advance_adjusted: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 }, // PO advance set off against this invoice
    returns_credit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 }, // goods returned after the invoice (value + GST)
    discount_received: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 }, // cash discount taken when paying
    hsn_sac_code: { type: DataTypes.STRING(20) },
    itc_eligible: { type: DataTypes.BOOLEAN, defaultValue: true },
    document_url: { type: DataTypes.STRING(500) },
    // Pending = UNPAID, Approved = APPROVED_FOR_PAYMENT, Partially Paid = PARTIAL, Paid = PAID.
    status: { type: DataTypes.ENUM('UNPAID', 'PARTIAL', 'PAID', 'EXCEPTION', 'APPROVED_FOR_PAYMENT', 'WAITING_FOR_PAYMENT', 'REJECTED'), defaultValue: 'UNPAID' },
    due_date: { type: DataTypes.DATEONLY, allowNull: true },
    paid_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    source: { type: DataTypes.ENUM('MANUAL', 'AI_EXTRACTED'), defaultValue: 'MANUAL' },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    rejected_by: { type: DataTypes.INTEGER, allowNull: true },
    rejected_at: { type: DataTypes.DATE, allowNull: true },
    rejection_reason: { type: DataTypes.TEXT, allowNull: true },
    payment_source: { type: DataTypes.STRING(40), allowNull: true },        // CR-HYB-01: external payment (e.g. ORACLE)
    external_payment_ref: { type: DataTypes.STRING(100), allowNull: true }, // voucher / UTR from the external ERP
    payment_date: { type: DataTypes.DATE, allowNull: true },
    payment_synced_at: { type: DataTypes.DATE, allowNull: true },
    matching_status: { type: DataTypes.ENUM('PENDING', 'MATCHED', 'MISMATCHED'), defaultValue: 'PENDING' },
    matching_exception_details: { type: DataTypes.TEXT },
    payment_blocked: { type: DataTypes.BOOLEAN, defaultValue: false },
    payment_block_reason: { type: DataTypes.TEXT },
    exception_status: { type: DataTypes.ENUM('NONE', 'OPEN', 'MANUAL_APPROVED', 'REJECTED'), defaultValue: 'NONE' },
    exception_resolved_by: { type: DataTypes.INTEGER },
    exception_resolved_at: { type: DataTypes.DATE },
    matching_tolerance_percent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 5 },
    matching_details_json: { type: DataTypes.JSON }
  }, {
    sequelize,
    modelName: 'Invoice',
    tableName: 'invoices',
    freezeTableName: true
  });

  return Invoice;
};
