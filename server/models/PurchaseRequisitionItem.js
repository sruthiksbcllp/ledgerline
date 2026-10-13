const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class PurchaseRequisitionItem extends Model {
    static associate(models) {
      PurchaseRequisitionItem.belongsTo(models.PurchaseRequisition, { foreignKey: 'requisition_id', as: 'requisition' });
    }
  }

  PurchaseRequisitionItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    },

    requisition_id: { type: DataTypes.INTEGER, allowNull: false },

    item_id: { type: DataTypes.INTEGER, allowNull: true },
    item_name: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    unit: { type: DataTypes.STRING },
    estimated_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    justification: { type: DataTypes.TEXT }
  }, {
    sequelize,
    modelName: 'PurchaseRequisitionItem',
    tableName: 'purchase_requisition_items',
    freezeTableName: true,
    underscored: true
  });

  return PurchaseRequisitionItem;
};
