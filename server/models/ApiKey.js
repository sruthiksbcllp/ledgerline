'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ApiKey extends Model {
    static associate(models) {
      ApiKey.belongsTo(models.Entity, { foreignKey: 'entity_id' });
    }
  }
  ApiKey.init({
    entity_id: { type: DataTypes.INTEGER, allowNull: false },
    api_key: { type: DataTypes.STRING, unique: true, allowNull: false },
    secret_key: { type: DataTypes.STRING, unique: true, allowNull: false },
    label: DataTypes.STRING,
    status: { type: DataTypes.ENUM('ACTIVE', 'REVOKED'), defaultValue: 'ACTIVE' },
    last_used: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'ApiKey',
    tableName: 'apikeys',
    freezeTableName: true,
  });
  return ApiKey;
};
