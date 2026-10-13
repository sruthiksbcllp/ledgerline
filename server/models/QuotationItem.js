const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class QuotationItem extends Model {
    static associate(models) {
      this.belongsTo(models.Quotation, { foreignKey: 'quotation_id' });
      this.belongsTo(models.Item, { foreignKey: 'item_id', as: "item" });

    }
  }

  QuotationItem.init({
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    },

    quotation_id: { type: DataTypes.INTEGER, allowNull: false },

    item_id: { type: DataTypes.INTEGER, allowNull: true },
    item_name: { type: DataTypes.STRING }, // Snapshot for record
    description: { type: DataTypes.TEXT },
    quantity: { type: DataTypes.DECIMAL(15, 2), defaultValue: 1 },
    unit_price: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    tax_percent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    tax_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    discount_percent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    uom: { type: DataTypes.STRING },
    remarks: { type: DataTypes.TEXT }
  }, {
    sequelize,
    modelName: 'QuotationItem',
    tableName: 'quotation_items',
    freezeTableName: true,
    underscored: true
  });

  return QuotationItem;
};
