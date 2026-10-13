'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Company extends Model {
    static associate(models) {
      Company.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
      Company.hasMany(models.UserCompanyAssignment, { foreignKey: 'company_id', as: 'assignments' });
      Company.hasOne(models.CompanyPolicy, { foreignKey: 'company_id', as: 'policy' });
    }
  }
  Company.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    company_code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    company_name: { type: DataTypes.STRING(255), allowNull: false },
    company_type: {
      type: DataTypes.ENUM('PARTNERSHIP', 'LIMITED_LIABILITY', 'SOLE_PROPRIETOR', 'CORPORATION'),
      defaultValue: 'LIMITED_LIABILITY'
    },
    registration_number: DataTypes.STRING(100),
    tax_identification_number: DataTypes.STRING(100),
    gst_registration_number: DataTypes.STRING(50),
    address_line_1: DataTypes.STRING(255),
    address_line_2: DataTypes.STRING(255),
    city: DataTypes.STRING(100),
    state: DataTypes.STRING(100),
    postal_code: DataTypes.STRING(20),
    country: { type: DataTypes.STRING(100), defaultValue: 'India' },
    email: DataTypes.STRING(255),
    phone: DataTypes.STRING(20),
    reporting_currency: { type: DataTypes.ENUM('INR', 'USD', 'EUR', 'GBP'), defaultValue: 'INR' },
    financial_year_start_month: { type: DataTypes.INTEGER, defaultValue: 4 },
    depreciation_method_default: {
      type: DataTypes.ENUM('SLM', 'WDV', 'DECLINING_BALANCE'),
      defaultValue: 'SLM'
    },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_primary: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_by: DataTypes.STRING(100),
    updated_by: DataTypes.STRING(100)
  }, {
    sequelize,
    tableName: 'companies',
    modelName: 'Company',
    timestamps: true,
    underscored: true
  });
  return Company;
};
