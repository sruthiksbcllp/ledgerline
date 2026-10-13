const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class GateEntry extends Model {
    static associate(models) {
      GateEntry.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      GateEntry.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      GateEntry.belongsTo(models.Property, { foreignKey: 'property_id' });
      GateEntry.belongsTo(models.User, { foreignKey: 'received_by', as: 'Receiver' });
      GateEntry.hasMany(models.GateEntryItem, { foreignKey: 'gate_entry_id', as: 'items' });
      GateEntry.belongsTo(models.GRN, { foreignKey: 'grn_id' });
    }
  }

  GateEntry.init({
    gate_entry_number: { type: DataTypes.STRING, unique: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    property_id: { type: DataTypes.INTEGER, allowNull: false },
    po_id: { type: DataTypes.INTEGER, allowNull: false },
    vendor_id: { type: DataTypes.INTEGER },
    grn_id: { type: DataTypes.INTEGER },
    received_by: { type: DataTypes.INTEGER },
    received_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    vehicle_number: { type: DataTypes.STRING(50) },
    challan_number: { type: DataTypes.STRING(100) },
    qc_status: {
      type: DataTypes.ENUM('PENDING', 'PASSED', 'FAILED', 'PARTIAL'),
      defaultValue: 'PENDING'
    },
    status: {
      type: DataTypes.ENUM('DRAFT', 'QC_COMPLETED', 'GRN_CREATED', 'CANCELLED'),
      defaultValue: 'DRAFT'
    },
    remarks: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'GateEntry',
    tableName: 'gate_entries',
    freezeTableName: true,
    underscored: true
  });

  return GateEntry;
};
