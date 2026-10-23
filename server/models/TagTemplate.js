'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TagTemplate extends Model {
    static associate(models) {
      // define association here
    }
  }
  TagTemplate.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    fields: { type: DataTypes.JSON, defaultValue: [] }, // ["asset_name", "asset_code", "location"]
    layout: { type: DataTypes.JSON, defaultValue: {} }, // size, font, logo position
    is_default: { type: DataTypes.BOOLEAN, defaultValue: false }
  }, {
    sequelize,
    modelName: 'TagTemplate',
    tableName: 'tagtemplates',
    freezeTableName: true,
    underscored: true
  });
  return TagTemplate;
};
