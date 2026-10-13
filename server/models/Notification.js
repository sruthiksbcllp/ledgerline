'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {}
  Notification.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    alert_id: { type: DataTypes.INTEGER },
    type: { type: DataTypes.ENUM('EMAIL', 'SMS', 'PUSH'), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'), defaultValue: 'PENDING' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'Notification',
    tableName: 'notifications',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return Notification;
};
