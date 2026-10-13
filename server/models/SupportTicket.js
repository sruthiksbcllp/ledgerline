'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SupportTicket extends Model {
    static associate(models) {
      SupportTicket.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
    }
  }
  SupportTicket.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    priority: { 
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'), 
      defaultValue: 'MEDIUM' 
    },
    status: { 
      type: DataTypes.ENUM('OPEN', 'IN_PROGRESS', 'CLOSED'), 
      defaultValue: 'OPEN' 
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'SupportTicket',
    tableName: 'support_tickets',
    freezeTableName: true,
    timestamps: false,
    underscored: true
  });
  return SupportTicket;
};
