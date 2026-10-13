'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NotificationLog extends Model {
    static associate(models) {
      NotificationLog.belongsTo(models.Client, { foreignKey: 'client_id' });
    }
  }

  NotificationLog.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    entity_type: { type: DataTypes.ENUM('MAINTENANCE', 'INSURANCE', 'WARRANTY', 'AMC', 'APPROVAL_REMINDER', 'APPROVAL_ESCALATION'), allowNull: false },
    entity_id: { type: DataTypes.INTEGER, allowNull: false },
    notification_type: { type: DataTypes.ENUM('EMAIL', 'SMS'), defaultValue: 'EMAIL' },
    sent_to: { type: DataTypes.STRING(255), allowNull: false },
    subject: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('SENT', 'FAILED'), defaultValue: 'SENT' },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    sent_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'NotificationLog',
    tableName: 'notificationlogs',
    freezeTableName: true,
    timestamps: false
  });

  return NotificationLog;
};
