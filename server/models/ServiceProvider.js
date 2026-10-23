'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ServiceProvider extends Model {
    static associate(models) {
      ServiceProvider.hasMany(models.Warranty, { foreignKey: 'service_provider_id' });
      ServiceProvider.hasMany(models.AssetAmc, { foreignKey: 'service_provider_id' });
      ServiceProvider.hasMany(models.AssetMaintenance, { foreignKey: 'service_provider_id' });
    }
  }
  ServiceProvider.init({
    provider_name: { type: DataTypes.STRING, allowNull: false },
    contact_person: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    address: DataTypes.TEXT,
    services_offered: DataTypes.TEXT,
    gst_number: DataTypes.STRING(20),
    pan_number: DataTypes.STRING(20),
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'ServiceProvider',
    tableName: 'serviceproviders',
    freezeTableName: true,
    timestamps: false
  });
  return ServiceProvider;
};
