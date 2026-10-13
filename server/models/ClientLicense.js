'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ClientLicense extends Model {
    static associate(models) {
      ClientLicense.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
    }
  }
  ClientLicense.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    plan_name: { type: DataTypes.STRING, allowNull: false },
    max_assets: { type: DataTypes.INTEGER, defaultValue: 100 },
    max_users: { type: DataTypes.INTEGER, defaultValue: 10 },
    start_date: { type: DataTypes.DATE, allowNull: false },
    end_date: { type: DataTypes.DATE, allowNull: false },
    status: { 
      type: DataTypes.ENUM('ACTIVE', 'EXPIRED'), 
      defaultValue: 'ACTIVE' 
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'ClientLicense',
    tableName: 'client_licenses',
    freezeTableName: true,
    timestamps: false,
    underscored: true
  });
  return ClientLicense;
};
