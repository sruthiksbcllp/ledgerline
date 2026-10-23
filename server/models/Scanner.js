'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Scanner extends Model {}
  Scanner.init({
    scanner_id: { type: DataTypes.STRING(50), primaryKey: true },
    api_key: { type: DataTypes.STRING(100), allowNull: false },
    location_id: { type: DataTypes.INTEGER },
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'Scanner',
    tableName: 'scanners',
    freezeTableName: true,
    underscored: true
  });
  return Scanner;
};
