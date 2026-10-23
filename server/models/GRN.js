const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class GRN extends Model {
    static associate(models) {
      this.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      this.belongsTo(models.Entity, { foreignKey: 'entity_id', as: 'Entity' });
      this.belongsTo(models.Property, { foreignKey: 'property_id' });
      this.belongsTo(models.Location, { foreignKey: 'location_id' }); // location arc
      this.belongsTo(models.User, { foreignKey: 'received_by', as: 'Receiver' });
      this.hasMany(models.Invoice, { foreignKey: 'grn_id' });
      this.hasMany(models.GRNItem, { foreignKey: 'grn_id' });
      this.belongsTo(models.GateEntry, { foreignKey: 'gate_entry_id' });
    }
  }

  GRN.init({
    grn_number: { type: DataTypes.STRING, unique: true },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    },

    property_id: { type: DataTypes.INTEGER, allowNull: false },

    po_id: { type: DataTypes.INTEGER, allowNull: false },
    entity_id: { type: DataTypes.INTEGER, allowNull: true }, // Phase D - buying entity
    location_id: { type: DataTypes.INTEGER, allowNull: true }, // location arc - from PO
    gate_entry_id: { type: DataTypes.INTEGER },
    vendor_id: { type: DataTypes.INTEGER },
    invoice_number: { type: DataTypes.STRING },
    received_date: { type: DataTypes.DATE },
    status: { 
      type: DataTypes.ENUM('RECEIVED', 'PARTIAL', 'COMPLETED', 'REJECTED'), 
      defaultValue: 'RECEIVED' 
    },
    remarks: { type: DataTypes.TEXT }
  }, {
    sequelize,
    modelName: 'GRN',
    tableName: 'grns',
    freezeTableName: true
  });

  return GRN;
};
