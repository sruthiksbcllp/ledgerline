'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetCodeConfig extends Model {}
  AssetCodeConfig.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    code_mode: { 
      type: DataTypes.ENUM('ERP', 'AUTO', 'CUSTOM'), 
      allowNull: false,
      defaultValue: 'AUTO'
    },
    prefix: { type: DataTypes.STRING(100), defaultValue: 'AST' },
    sequence_length: { type: DataTypes.INTEGER, defaultValue: 4 },
    allow_manual_override: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'AssetCodeConfig',
    tableName: 'asset_code_config',
    freezeTableName: true,
    underscored: true
  });
  return AssetCodeConfig;
};
