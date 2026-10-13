const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class GRNItem extends Model {
    static associate(models) {
      GRNItem.belongsTo(models.GRN, { foreignKey: 'grn_id' });
      GRNItem.belongsTo(models.PurchaseOrderItem, { foreignKey: 'po_item_id' });
      // getGRNById includes GRNItemSerial under GRNItem — the reverse (belongsTo) existed but
      // this hasMany was missing, so the include threw "GRNItemSerial is not associated to GRNItem".
      if (models.GRNItemSerial) GRNItem.hasMany(models.GRNItemSerial, { foreignKey: 'grn_item_id' });
    }
  }

  GRNItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    },
    grn_id: { type: DataTypes.INTEGER, allowNull: false },

    po_item_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: true },
    item_name: { type: DataTypes.STRING, allowNull: false },
    ordered_quantity: { type: DataTypes.DECIMAL(10, 2) },
    received_quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    accepted_quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    rejected_quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    damaged_quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    quality_bucket: { type: DataTypes.ENUM('ACCEPTED', 'REJECTED', 'DAMAGED', 'MIXED'), defaultValue: 'ACCEPTED' },
    qc_status: { type: DataTypes.ENUM('PENDING', 'PASS', 'FAIL'), defaultValue: 'PENDING' },
    condition: { type: DataTypes.ENUM('GOOD', 'DAMAGED', 'WRONG_ITEM'), defaultValue: 'GOOD' },
    qc_remarks: { type: DataTypes.TEXT },
    remarks: { type: DataTypes.TEXT }
  }, {
    sequelize,
    modelName: 'GRNItem',
    tableName: 'grn_items',
    freezeTableName: true,
    underscored: true
  });

  return GRNItem;
};
