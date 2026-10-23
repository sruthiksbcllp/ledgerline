const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Quotation extends Model {
    static associate(models) {
      this.belongsTo(models.Vendor, { foreignKey: "vendor_id", as: "vendor" });
      this.belongsTo(models.PurchaseRequisition, { foreignKey: 'pr_id', as: 'PR', nullable: true });
      this.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
      this.hasMany(models.QuotationItem, { foreignKey: "quotation_id", as: "items" });


    }
  }

  Quotation.init({
    quotation_number: { type: DataTypes.STRING, unique: true },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    pr_id: { type: DataTypes.INTEGER, allowNull: true },

    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    valid_until: { type: DataTypes.DATE },
    total_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    currency: { type: DataTypes.STRING, defaultValue: 'INR' },
    tax_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    discount_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    shipping_charges: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    net_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    status: { 
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PO_CREATED', 'NOT_APPROVED'), 
      defaultValue: 'DRAFT' 
    },
    remarks: { type: DataTypes.TEXT },
    attachments: { type: DataTypes.JSON },
    created_by: { type: DataTypes.INTEGER },
    deviation_reason: { type: DataTypes.TEXT, allowNull: true }, // L1-deviation justification
    selected_rank: { type: DataTypes.INTEGER, allowNull: true },     // L1/L2/L3 at award time
    is_selected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
  }, {
    sequelize,
    modelName: 'Quotation',
    tableName: 'quotation_master',
    freezeTableName: true,
    underscored: true
  });

  return Quotation;
};
