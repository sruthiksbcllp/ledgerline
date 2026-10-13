'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SBCLead extends Model {
    static associate(models) {
      // define association here
    }
  }
  SBCLead.init({
    client_name: DataTypes.STRING,
    client_id: DataTypes.INTEGER,
    contact_email: DataTypes.STRING,
    contact_phone: DataTypes.STRING,
    missing_assets: DataTypes.INTEGER,
    risk_value: DataTypes.DECIMAL(15, 2),
    location: DataTypes.STRING,
    status: {
      type: DataTypes.ENUM('NEW', 'CONTACTED', 'CLOSED'),
      defaultValue: 'NEW'
    }
  }, {
    sequelize,
    modelName: 'SBCLead',
    tableName: 'sbc_leads',
    freezeTableName: true,
    underscored: true
  });
  return SBCLead;
};
