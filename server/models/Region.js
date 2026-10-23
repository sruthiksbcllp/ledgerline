'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Region extends Model {
    static associate(models) {
      Region.hasMany(models.Location, { foreignKey: 'region_id' });
      Region.hasMany(models.Property, { foreignKey: 'region_id' });
      Region.hasMany(models.Asset, { foreignKey: 'region_id' });
    }
  }
  Region.init({
    region_name: { type: DataTypes.STRING, allowNull: false },
    region_code: { type: DataTypes.STRING, unique: true, allowNull: false },
    country: DataTypes.STRING,
    description: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'Region',
    tableName: 'regions',
    freezeTableName: true,
    timestamps: false
  });
  return Region;
};
