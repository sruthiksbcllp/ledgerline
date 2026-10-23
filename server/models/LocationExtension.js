'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LocationExtension extends Model {
    static associate(models) {
      LocationExtension.belongsTo(models.Location, { foreignKey: 'location_id' });
    }
  }
  LocationExtension.init({
    location_id: { type: DataTypes.INTEGER, allowNull: false },
    building: DataTypes.STRING,
    floor: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'LocationExtension',
    tableName: 'location_extensions',
    freezeTableName: true,
    underscored: true
  });
  return LocationExtension;
};
