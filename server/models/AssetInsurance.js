'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class AssetInsurance extends Model {
    static associate(models) {
      AssetInsurance.belongsTo(models.Asset, { foreignKey: 'asset_id', as: 'asset' });
    }
  }
  AssetInsurance.init({
    id:               { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    asset_id:         { type: DataTypes.INTEGER, allowNull: false },
    client_id:        { type: DataTypes.INTEGER, allowNull: true },
    policy_number:    { type: DataTypes.STRING(100), allowNull: false },
    insurer_name:     { type: DataTypes.STRING(200), allowNull: false },
    policy_type:      { type: DataTypes.ENUM('FIRE','THEFT','COMPREHENSIVE','LIABILITY','MARINE','OTHER'), defaultValue: 'COMPREHENSIVE' },
    sum_insured:      { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    premium_amount:   { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    premium_frequency:{ type: DataTypes.ENUM('ANNUAL','SEMI_ANNUAL','QUARTERLY','MONTHLY'), defaultValue: 'ANNUAL' },
    start_date:       { type: DataTypes.DATEONLY, allowNull: false },
    expiry_date:      { type: DataTypes.DATEONLY, allowNull: false },
    renewal_reminder_days: { type: DataTypes.INTEGER, defaultValue: 30 },
    status:           { type: DataTypes.ENUM('ACTIVE','EXPIRED','CANCELLED','PENDING_RENEWAL'), defaultValue: 'ACTIVE' },
    nominee:          { type: DataTypes.STRING(200), allowNull: true },
    notes:            { type: DataTypes.TEXT, allowNull: true },
    document_url:     { type: DataTypes.STRING(500), allowNull: true },
    created_by:       { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    modelName: 'AssetInsurance',
    tableName: 'assetinsurances',
    underscored: true,
    timestamps: true,
  });
  return AssetInsurance;
};
