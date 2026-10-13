'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TDSSection extends Model {}
  TDSSection.init({
    section_code: DataTypes.STRING(20),
    description: DataTypes.TEXT,
    threshold_amount: DataTypes.DECIMAL(15, 2),
    individual_rate: DataTypes.DECIMAL(5, 2),
    company_rate: DataTypes.DECIMAL(5, 2),
    is_active: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'TDSSection',
    tableName: 'tds_sections',
    underscored: true,
    freezeTableName: true
  });
  return TDSSection;
};

