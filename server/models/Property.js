'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Property extends Model {
    static associate(models) {
      Property.belongsTo(models.PropertyType, { foreignKey: 'property_type_id' });
      Property.belongsTo(models.Region, { foreignKey: 'region_id' });
      Property.hasMany(models.Location, { foreignKey: 'property_id' });
      Property.hasMany(models.Asset, { foreignKey: 'property_id' });
      Property.hasMany(models.AuditSession, { foreignKey: 'property_id' });
    }

  }
  Property.init({
    property_name: { type: DataTypes.STRING, allowNull: false },
    state_code: { type: DataTypes.STRING(2), allowNull: true },
    gstin: { type: DataTypes.STRING(15), allowNull: true },
    property_type_id: { type: DataTypes.INTEGER, allowNull: false },
    building_block: DataTypes.STRING,
    address: DataTypes.TEXT,
    region_id: DataTypes.INTEGER,
    description: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    }

  }, {
    sequelize,
    modelName: 'Property',
    tableName: 'properties',
    freezeTableName: true,
    timestamps: false
  });
  return Property;
};
