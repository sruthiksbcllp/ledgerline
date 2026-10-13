'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationLog extends Model {
    static associate(models) {
      IntegrationLog.belongsTo(models.IntegrationQueue, {
        foreignKey: 'queue_id',
        as: 'queue'
      });
    }
  }
  
  IntegrationLog.init({
    queue_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false
    },
    request_payload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    response_payload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'IntegrationLog',
    tableName: 'integration_logs',
    freezeTableName: true,
  });
  
  return IntegrationLog;
};
