'use strict';
module.exports = (sequelize, DataTypes) => {
  const RfqItem = sequelize.define('RfqItem', {
    rfq_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER },
    item_name: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    quantity: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    unit: { type: DataTypes.STRING },
    category_id: { type: DataTypes.INTEGER }
  }, { tableName: 'rfq_items', timestamps: true, underscored: true });
  RfqItem.associate = (models) => {
    RfqItem.belongsTo(models.Rfq, { foreignKey: 'rfq_id' });
  };
  return RfqItem;
};
