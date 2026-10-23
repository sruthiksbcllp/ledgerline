'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IdSequence extends Model {}
  IdSequence.init({
    prefix: { type: DataTypes.STRING(20), unique: true, allowNull: false },
    last_value: { type: DataTypes.INTEGER, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'IdSequence',
    tableName: 'idsequences',
    freezeTableName: true,
  });
  return IdSequence;
};
