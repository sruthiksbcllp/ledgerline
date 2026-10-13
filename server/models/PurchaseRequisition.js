const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class PurchaseRequisition extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: 'requestor_id', as: 'Requestor' });
      this.belongsTo(models.Department, { foreignKey: 'department_id' });
      this.belongsTo(models.Property, { foreignKey: 'property_id' });
      this.belongsTo(models.Location, { foreignKey: 'location_id' }); // location arc
      this.belongsTo(models.User, { foreignKey: 'approved_by', as: 'Approver' });
      this.hasOne(models.PurchaseOrder, { foreignKey: 'pr_id' });
      this.hasMany(models.PurchaseRequisitionItem, { foreignKey: 'requisition_id', as: 'items', onDelete: 'CASCADE' });
      this.belongsTo(models.ApprovalWorkflow, { foreignKey: 'workflow_id', as: 'Workflow' });
      this.belongsTo(models.Entity, { foreignKey: 'entity_id', as: 'Entity' });
      this.belongsTo(models.User, { foreignKey: 'requested_by_user_id', as: 'RequestedBy' });
      this.belongsTo(models.Asset, { foreignKey: 'asset_id', as: 'Asset' });
      this.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'Vendor' });
    }
  }

  PurchaseRequisition.init({
    pr_number: { type: DataTypes.STRING, unique: true },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    },

    property_id: { type: DataTypes.INTEGER, allowNull: false },

    department_id: { type: DataTypes.INTEGER, allowNull: true },
    cost_center: { type: DataTypes.STRING },
    location_id: { type: DataTypes.INTEGER, allowNull: true }, // CR-P05
    cost_center_id: { type: DataTypes.INTEGER, allowNull: true }, // CR-P05
    required_date: { type: DataTypes.DATE },
    vendor_suggestion: { type: DataTypes.STRING },
    item_description: { type: DataTypes.TEXT }, // Summary description
    justification: { type: DataTypes.TEXT },
    estimated_cost: { type: DataTypes.DECIMAL(15, 2) },
    total_cost: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    type: { 
      type: DataTypes.ENUM('CAPEX', 'OPEX'), 
      defaultValue: 'CAPEX' 
    },
    status: { 
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'PO_CREATED', 'PENDING_CONFIGURATION'), 
      defaultValue: 'DRAFT' 
    },
    current_level: { type: DataTypes.INTEGER, defaultValue: 0 },
    current_approval_level: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_approval_levels: { type: DataTypes.INTEGER, defaultValue: 0 },
    workflow_id: { type: DataTypes.INTEGER, allowNull: true },
    status_lock: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_fully_approved: { type: DataTypes.BOOLEAN, defaultValue: false },
    approval_date: { type: DataTypes.DATE, allowNull: true },
    attachments: { type: DataTypes.JSON }, // To store array of attachment metadata/URLs
    entity_id: { type: DataTypes.INTEGER, allowNull: true },
    requested_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    requestor_name: { type: DataTypes.STRING, allowNull: true }, // free-text actual requestor (non-user)
    asset_id: { type: DataTypes.INTEGER, allowNull: true },
    vendor_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'PurchaseRequisition',
    tableName: 'purchaserequisitions',
    freezeTableName: true
  });

  return PurchaseRequisition;
};
