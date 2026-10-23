const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class GateEntryItem extends Model {
    static associate(models) {
      GateEntryItem.belongsTo(models.GateEntry, { foreignKey: 'gate_entry_id' });
      GateEntryItem.belongsTo(models.PurchaseOrderItem, { foreignKey: 'po_item_id' });
    }
  }

  GateEntryItem.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    gate_entry_id: { type: DataTypes.INTEGER, allowNull: false },
    po_item_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER },
    item_name: { type: DataTypes.STRING, allowNull: false },
    ordered_quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    received_quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    accepted_quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    rejected_quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    damaged_quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    quality_bucket: {
      type: DataTypes.ENUM('ACCEPTED', 'REJECTED', 'DAMAGED', 'MIXED'),
      defaultValue: 'ACCEPTED'
    },
    qc_status: {
      type: DataTypes.ENUM('PENDING', 'PASS', 'FAIL', 'PARTIAL'),
      defaultValue: 'PENDING'
    },
    qc_remarks: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'GateEntryItem',
    tableName: 'gate_entry_items',
    freezeTableName: true,
    underscored: true
  });

  return GateEntryItem;
};
