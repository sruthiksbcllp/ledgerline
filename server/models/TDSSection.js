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
    act2025_ref: DataTypes.STRING(40), // Income-tax Act 2025 reference, e.g. 393(1) Sl. 6(i)
    payment_code: DataTypes.STRING(20), // challan payment code
    single_threshold: DataTypes.DECIMAL(15, 2),
    threshold_basis: { type: DataTypes.STRING(10), defaultValue: 'YEAR' },
    excess_only: { type: DataTypes.BOOLEAN, defaultValue: false },
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

