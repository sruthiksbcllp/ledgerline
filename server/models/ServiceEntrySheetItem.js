const { Model, DataTypes } = require('sequelize');

/** One PO line on a Service Entry Sheet: how much of the ordered service is accepted, at the PO price. */
module.exports = (sequelize) => {
  class ServiceEntrySheetItem extends Model {
    static associate(models) {
      this.belongsTo(models.ServiceEntrySheet, { foreignKey: 'ses_id' });
      this.belongsTo(models.PurchaseOrderItem, { foreignKey: 'po_item_id' });
    }
  }

  ServiceEntrySheetItem.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    ses_id: { type: DataTypes.INTEGER, allowNull: false },
    po_item_id: { type: DataTypes.INTEGER, allowNull: false },
    item_name: { type: DataTypes.STRING(255), allowNull: false },
    ordered_quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    unit_price: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    remarks: { type: DataTypes.TEXT, allowNull: true }
  }, {
    sequelize,
    modelName: 'ServiceEntrySheetItem',
    tableName: 'service_entry_sheet_items',
    underscored: true,
    timestamps: true
  });

  return ServiceEntrySheetItem;
};
