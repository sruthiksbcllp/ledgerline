'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Unit extends Model {
    static associate(models) {
      Unit.hasMany(models.Item, { foreignKey: 'unit_id' });
    }
  }
  Unit.init({
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    code: { type: DataTypes.STRING, allowNull: false, unique: true },
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'Unit',
    tableName: 'units',
    freezeTableName: true,
    timestamps: true,
  });
  return Unit;
};
