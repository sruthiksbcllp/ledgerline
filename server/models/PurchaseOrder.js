const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class PurchaseOrder extends Model {
    static associate(models) {
      this.belongsTo(models.PurchaseRequisition, { foreignKey: 'pr_id' });
      this.belongsTo(models.Quotation, { foreignKey: 'quotation_id', as: 'Quotation' });
      this.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      this.belongsTo(models.Property, { foreignKey: 'property_id' });
      this.belongsTo(models.Entity, { foreignKey: 'entity_id', as: 'Entity' });
      this.belongsTo(models.Location, { foreignKey: 'location_id' }); // location arc
      this.hasMany(models.GRN, { foreignKey: 'po_id' });
      this.hasMany(models.ServiceEntrySheet, { foreignKey: 'po_id' });
      this.hasMany(models.Invoice, { foreignKey: 'po_id' });
      this.hasMany(models.PurchaseOrderItem, { foreignKey: 'po_id', as: 'items', onDelete: 'CASCADE' });
    }
  }

  PurchaseOrder.init({
    po_number: { type: DataTypes.STRING, unique: true },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    },

    property_id: { type: DataTypes.INTEGER, allowNull: false },
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    department_id: { type: DataTypes.INTEGER },
    pr_id: { type: DataTypes.INTEGER, allowNull: true },
    quotation_id: { type: DataTypes.INTEGER, allowNull: true },
    source_type: { 
      type: DataTypes.ENUM('PR', 'QUOTATION', 'DIRECT'), 
      defaultValue: 'PR' 
    },
    source_id: { type: DataTypes.INTEGER, allowNull: true }, // Generic ID for flexibility
    cost_center: { type: DataTypes.STRING },
    cost_center_id: { type: DataTypes.INTEGER, allowNull: true }, // Phase A - parity with PR (CR-P05)
    entity_id: { type: DataTypes.INTEGER, allowNull: true }, // Phase A - buying entity inherited from PR
    type: { type: DataTypes.ENUM('CAPEX', 'OPEX'), allowNull: true }, // DOA-0 - Capex/Opex inherited from PR
    vendor_email_sent_at: { type: DataTypes.DATE, allowNull: true }, // CFG-02 - last time PO emailed to vendor
    vendor_email_sent_to: { type: DataTypes.STRING, allowNull: true }, // CFG-02 - vendor address it was sent to
    approval_comment: { type: DataTypes.TEXT, allowNull: true }, // CFG-02b - free-text note shown in the approval email
    location_id: { type: DataTypes.INTEGER, allowNull: true }, // location arc - from PR
    requestor_name: { type: DataTypes.STRING, allowNull: true }, // requestor arc - free-text requestor from PR / Direct form
    po_warranty: { type: DataTypes.STRING(255), allowNull: true }, // Phase 4b per-PO T&C override
    po_payment_terms: { type: DataTypes.STRING(255), allowNull: true },
    po_terms: { type: DataTypes.TEXT, allowNull: true },
    total_amount: { type: DataTypes.DECIMAL(15, 2) },
    order_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    required_date: { type: DataTypes.DATE },
    status: { 
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'IN_APPROVAL', 'ISSUED', 'PARTIAL_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED', 'APPROVED', 'REJECTED', 'PENDING_CONFIGURATION'), 
      defaultValue: 'DRAFT' 
    },
    workflow_id: { type: DataTypes.INTEGER, allowNull: true },
    current_level: { type: DataTypes.INTEGER, defaultValue: 0 },
    current_approval_level: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_approval_levels: { type: DataTypes.INTEGER, defaultValue: 0 },
    status_lock: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_fully_approved: { type: DataTypes.BOOLEAN, defaultValue: false },
    approval_date: { type: DataTypes.DATE, allowNull: true },
    version: { type: DataTypes.INTEGER, defaultValue: 1 }
  }, {
    sequelize,
    modelName: 'PurchaseOrder',
    tableName: 'purchaseorders',
    freezeTableName: true
  });

  return PurchaseOrder;
};
