'use strict';
const { Model } = require('sequelize');

/**
 * Expected credit loss settings for one company (blueprint O2C step 8, Ind AS 109): the loss rate
 * for each ageing bucket, and specific reserves for named problem customers. Reviewed by Finance or
 * the Director / CFO; every change is in the audit log.
 *   rates:    { not_due: 0.4, d0_30: 1, d31_60: 3, d61_90: 8, d90: 25 }   (percent)
 *   specific: [{ customer_id, amount, reason }]
 * Also holds the company's AR option einvoice_applies (GST e-invoicing: B2B invoices need an IRN).
 */
module.exports = (sequelize, DataTypes) => {
  class ArEclSetting extends Model {}
  ArEclSetting.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    rates: { type: DataTypes.JSON, allowNull: true },
    specific: { type: DataTypes.JSON, allowNull: true },
    einvoice_applies: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    updated_by: { type: DataTypes.INTEGER, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize, modelName: 'ArEclSetting', tableName: 'ar_ecl_settings', freezeTableName: true, underscored: true, timestamps: true
  });
  return ArEclSetting;
};
