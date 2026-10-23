'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditNotification extends Model {
    static associate(models) {
      AuditNotification.belongsTo(models.AuditSession, { foreignKey: 'audit_session_id' });
    }
  }
  AuditNotification.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    audit_session_id: { type: DataTypes.INTEGER },
    type: { type: DataTypes.ENUM('CRITICAL', 'WARNING', 'REMINDER', 'INFO'), defaultValue: 'INFO' },
    message: { type: DataTypes.TEXT, allowNull: false },
    target_role: { type: DataTypes.STRING, defaultValue: 'admin' },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
    client_id: { type: DataTypes.INTEGER },
    metadata: DataTypes.JSON

  }, {
    sequelize,
    modelName: 'AuditNotification',
    tableName: 'audit_notifications',
    freezeTableName: true,
    underscored: true
  });
  return AuditNotification;
};
