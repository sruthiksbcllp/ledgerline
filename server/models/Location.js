'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Location extends Model {
    static associate(models) {
      Location.belongsTo(models.Region, { foreignKey: 'region_id' });
      Location.belongsTo(models.Property, { foreignKey: 'property_id' });
      Location.hasMany(models.Asset, { foreignKey: 'location_id' });
      Location.hasMany(models.AuditSession, { foreignKey: 'location_id' });
      Location.hasMany(models.AuditScan, { foreignKey: 'scanned_location_id' });
      Location.hasOne(models.LocationExtension, { foreignKey: 'location_id', as: 'hierarchy' });
      Location.belongsTo(models.Location, { foreignKey: 'parent_id', as: 'Parent' });
      Location.hasMany(models.Location, { foreignKey: 'parent_id', as: 'Children' });
    }

  }
  Location.init({
    location_name: { type: DataTypes.STRING, allowNull: false },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    },

    location_code: { type: DataTypes.STRING, unique: true, allowNull: false },
    region_id: { type: DataTypes.INTEGER, allowNull: false },
    property_id: DataTypes.INTEGER,
    full_address: DataTypes.TEXT,
    pincode: DataTypes.STRING(10),
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
    parent_id: DataTypes.INTEGER,
    type: DataTypes.STRING(50)
  }, {
    sequelize,
    modelName: 'Location',
    tableName: 'locations',
    freezeTableName: true,
  });
  return Location;
};
