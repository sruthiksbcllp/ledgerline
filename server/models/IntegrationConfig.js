'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationConfig extends Model {
    static associate(models) {
      // associations
    }
  }
  
  IntegrationConfig.init({
    erp_type: {
      type: DataTypes.ENUM('SAP', 'TALLY', 'ORACLE', 'CUSTOM'),
      allowNull: false
    },
    base_url: DataTypes.STRING,
    auth_token: DataTypes.STRING,
    integration_name: DataTypes.STRING,
    integration_type: DataTypes.STRING,
    auth_type: DataTypes.STRING,
    username: DataTypes.STRING,
    password: DataTypes.STRING,
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    sync_frequency: {
      type: DataTypes.STRING,
      defaultValue: 'real-time'
    },
    conflict_resolution: {
      type: DataTypes.STRING,
      defaultValue: 'ERP_WINS'
    }
  }, {
    sequelize,
    modelName: 'IntegrationConfig',
    tableName: 'integration_configs',
    freezeTableName: true,
  });
  
  return IntegrationConfig;
};
