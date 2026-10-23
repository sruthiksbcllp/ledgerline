'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProviderUser extends Model {
    static associate(models) {
      ProviderUser.belongsTo(models.ServiceProvider, { foreignKey: 'provider_id' });
    }
  }
  ProviderUser.init({
    provider_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING },
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'ProviderUser',
    tableName: 'provider_users',
    freezeTableName: true,
    timestamps: true,
  });
  return ProviderUser;
};
