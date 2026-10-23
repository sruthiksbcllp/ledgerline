'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetAmc extends Model {
    static associate(models) {
      AssetAmc.belongsTo(models.Asset, { foreignKey: 'asset_id', as: 'asset' });
      AssetAmc.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
    }
  }
  AssetAmc.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    asset_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      references: { model: 'assets', key: 'id' }
    },
    vendor_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      references: { model: 'Vendors', key: 'id' }
    },
    amc_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'FULL / LIMITED / WARRANTY'
    },
    start_date: { 
      type: DataTypes.DATE, 
      allowNull: false 
    },
    end_date: { 
      type: DataTypes.DATE, 
      allowNull: false 
    },
    cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ACTIVE',
      comment: 'ACTIVE / EXPIRED'
    },
    service_frequency: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Monthly / Quarterly / Yearly'
    },
    last_service_date: {
      type: DataTypes.DATE
    },
    next_service_date: {
      type: DataTypes.DATE
    },
    remarks: {
      type: DataTypes.TEXT
    },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'AssetAmc',
    tableName: 'asset_amcs',
    freezeTableName: true,
    timestamps: true,
    updatedAt: 'updated_at',
    createdAt: 'created_at'
  });
  return AssetAmc;
};
