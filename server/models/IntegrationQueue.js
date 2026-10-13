'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationQueue extends Model {
    static associate(models) {
      IntegrationQueue.hasMany(models.IntegrationLog, {
        foreignKey: 'queue_id',
        as: 'logs'
      });
    }
  }
  
  IntegrationQueue.init({
    erp_type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    action: {
      type: DataTypes.STRING, // e.g., 'POST_PO', 'SYNC_ASSET'
      allowNull: false
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'PROCESSING', 'FAILED', 'COMPLETED'),
      defaultValue: 'PENDING'
    },
    retry_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    next_retry_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    dedupe_key: {
      type: DataTypes.STRING(190),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'IntegrationQueue',
    tableName: 'integration_queues',
    freezeTableName: true,
  });
  
  return IntegrationQueue;
};
