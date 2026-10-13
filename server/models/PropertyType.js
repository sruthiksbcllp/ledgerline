'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PropertyType extends Model {
    static associate(models) {
      PropertyType.hasMany(models.Property, { foreignKey: 'property_type_id' });
    }
  }
  PropertyType.init({
    type_name: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'PropertyType',
    tableName: 'propertytypes',
    freezeTableName: true,
    timestamps: false
  });
  return PropertyType;
};
