'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('SessionRegistry', {
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: DataTypes.INTEGER,
    token_hash: { type: DataTypes.STRING(128), allowNull: false },
    ip_address: DataTypes.STRING(45),
    user_agent: DataTypes.STRING(500),
    device_fingerprint: DataTypes.STRING(128),
    expires_at: DataTypes.DATE,
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { tableName: 'session_registry', timestamps: true, underscored: true, updatedAt: false });
};
