'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TDSNonFiler extends Model {}
  TDSNonFiler.init({
    pan: DataTypes.STRING(10),
    name: DataTypes.STRING(255),
    fy: DataTypes.STRING(10),
    source: DataTypes.STRING(50)
  }, {
    sequelize,
    modelName: 'TDSNonFiler',
    tableName: 'tds_non_filers',
    underscored: true,
    updatedAt: false,
    freezeTableName: true
  });
  return TDSNonFiler;
};

