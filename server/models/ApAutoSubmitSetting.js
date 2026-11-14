'use strict';
const { Model } = require('sequelize');

/** Per-company auto-submit settings for clean AI-read bills (off by default). */
module.exports = (sequelize, DataTypes) => {
  class ApAutoSubmitSetting extends Model {}
  ApAutoSubmitSetting.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    max_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 100000 },
    track_record: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    spot_check_every: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    updated_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'ApAutoSubmitSetting',
    tableName: 'ap_auto_submit_settings',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ApAutoSubmitSetting;
};
