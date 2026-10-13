'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GlobalSetting extends Model {
    static associate(models) {
      GlobalSetting.belongsTo(models.User, { foreignKey: 'updated_by' });
    }
  }
  GlobalSetting.init({
    company_name: DataTypes.STRING(255),
    company_logo: DataTypes.STRING(500),
    currency_symbol: { type: DataTypes.STRING(5), defaultValue: '₹' },
    date_format: { type: DataTypes.STRING(20), defaultValue: 'DD-MM-YYYY' },
    fy_start_month: { type: DataTypes.INTEGER, defaultValue: 4 },
    default_depreciation_method: { type: DataTypes.ENUM('SLM', 'WDV'), defaultValue: 'SLM' },
    email_notifications: { type: DataTypes.BOOLEAN, defaultValue: true },
    amc_reminder_days: { type: DataTypes.INTEGER, defaultValue: 30 },
    warranty_reminder_days: { type: DataTypes.INTEGER, defaultValue: 30 },
    max_upload_size_mb: { type: DataTypes.INTEGER, defaultValue: 10 },
    session_timeout_minutes: { type: DataTypes.INTEGER, defaultValue: 30 },
    allow_excel_export: { type: DataTypes.BOOLEAN, defaultValue: true },
    allow_pdf_export: { type: DataTypes.BOOLEAN, defaultValue: true },
    enabled_features: { 
      type: DataTypes.JSON, 
      defaultValue: {
        procurement: true,
        finance_cwip: true,
        depreciation: true,
        audit: true,
        tagging_rfid: false
      }
    },
    updated_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'GlobalSetting',
    tableName: 'globalsettings',
    freezeTableName: true
  });
  return GlobalSetting;
};
