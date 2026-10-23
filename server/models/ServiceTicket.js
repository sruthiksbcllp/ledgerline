'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ServiceTicket extends Model {
    static associate(models) {
      ServiceTicket.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      ServiceTicket.belongsTo(models.ServiceProvider, { foreignKey: 'provider_id' });
    }
  }
  ServiceTicket.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    provider_id: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    status: { 
      type: DataTypes.ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'), 
      defaultValue: 'OPEN' 
    },
    priority: { 
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), 
      defaultValue: 'MEDIUM' 
    }
  }, {
    sequelize,
    modelName: 'ServiceTicket',
    tableName: 'service_tickets',
    freezeTableName: true,
    timestamps: true,
  });
  return ServiceTicket;
};
