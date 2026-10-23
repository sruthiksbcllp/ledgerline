'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserSession extends Model {
    static associate(models) {
      UserSession.belongsTo(models.User, { foreignKey: 'user_id' });
    }
  }
  UserSession.init({
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    refresh_token_hash: { type: DataTypes.TEXT, allowNull: false },
    ip_address: DataTypes.STRING(100),
    user_agent: DataTypes.TEXT,
    is_revoked: { type: DataTypes.BOOLEAN, defaultValue: false }
  }, {
    sequelize,
    modelName: 'UserSession',
    tableName: 'user_sessions',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  });
  return UserSession;
};
