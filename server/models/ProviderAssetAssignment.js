'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProviderAssetAssignment extends Model {
    static associate(models) {
      ProviderAssetAssignment.belongsTo(models.ServiceProvider, { foreignKey: 'provider_id' });
      ProviderAssetAssignment.belongsTo(models.Asset, { foreignKey: 'asset_id' });
    }
  }
  ProviderAssetAssignment.init({
    provider_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'ProviderAssetAssignment',
    tableName: 'provider_asset_assignments',
    freezeTableName: true,
    timestamps: true,
  });
  return ProviderAssetAssignment;
};
