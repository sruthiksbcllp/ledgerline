const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class VendorDebitNote extends Model {
    static associate(models) {
      VendorDebitNote.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      VendorDebitNote.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      VendorDebitNote.belongsTo(models.GRN, { foreignKey: 'grn_id' });
      VendorDebitNote.belongsTo(models.GateEntry, { foreignKey: 'gate_entry_id' });
      VendorDebitNote.belongsTo(models.Invoice, { foreignKey: 'invoice_id' });
    }
  }

  VendorDebitNote.init({
    debit_note_number: { type: DataTypes.STRING, unique: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    po_id: { type: DataTypes.INTEGER },
    grn_id: { type: DataTypes.INTEGER },
    gate_entry_id: { type: DataTypes.INTEGER },
    invoice_id: { type: DataTypes.INTEGER },
    reason: { type: DataTypes.STRING(255), allowNull: false },
    bucket: {
      type: DataTypes.ENUM('REJECTED', 'DAMAGED', 'MISMATCH', 'QUALITY'),
      defaultValue: 'QUALITY'
    },
    amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    tax_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('DRAFT', 'APPROVED', 'POSTED', 'CANCELLED'),
      defaultValue: 'DRAFT'
    },
    details_json: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'VendorDebitNote',
    tableName: 'vendor_debit_notes',
    freezeTableName: true,
    underscored: true
  });

  return VendorDebitNote;
};
