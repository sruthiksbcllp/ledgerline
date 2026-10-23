'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditTask extends Model {
    static associate(models) {
      AuditTask.belongsTo(models.User, { foreignKey: 'assigned_to', as: 'Assignee' });
    }
  }
  AuditTask.init({
    type: {
      type: DataTypes.ENUM('INVESTIGATION', 'AUDIT', 'VERIFICATION'),
      allowNull: false
    },
    source: {
      type: DataTypes.STRING,
      defaultValue: 'DASHBOARD'
    },
    reference_value: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    risk_value: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED'),
      defaultValue: 'PENDING'
    },
    assigned_to: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'AuditTask',
    tableName: 'audit_tasks',
    freezeTableName: true,
    underscored: true,
    timestamps: false // Manually handling created_at as per spec
  });
  return AuditTask;
};
