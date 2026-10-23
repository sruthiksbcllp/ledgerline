'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class RequestItem extends Model {
    static associate(models) {
      RequestItem.belongsTo(models.Request,  { foreignKey: 'request_id' });
      RequestItem.belongsTo(models.Asset,    { foreignKey: 'asset_id' });
      RequestItem.belongsTo(models.Item,     { foreignKey: 'item_id' });
      RequestItem.belongsTo(models.Location, { foreignKey: 'from_location_id', as: 'FromLocation' });
      RequestItem.belongsTo(models.Location, { foreignKey: 'to_location_id',   as: 'ToLocation' });
    }
  }

  RequestItem.init({
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    request_id:       { type: DataTypes.INTEGER, allowNull: false },
    asset_id:         { type: DataTypes.INTEGER },
    item_id:          { type: DataTypes.INTEGER },
    item_name:        { type: DataTypes.STRING },
    quantity:         { type: DataTypes.DECIMAL(10, 2), defaultValue: 1 },
    unit:             { type: DataTypes.STRING, defaultValue: 'unit' },
    estimated_cost:   { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    from_location_id: { type: DataTypes.INTEGER },
    to_location_id:   { type: DataTypes.INTEGER },
    reason:           { type: DataTypes.TEXT },
    remarks:          { type: DataTypes.TEXT }
  }, {
    sequelize,
    modelName: 'RequestItem',
    tableName: 'requestitems',
    freezeTableName: true,
    timestamps: true,
    underscored: false
  });

  return RequestItem;
};
