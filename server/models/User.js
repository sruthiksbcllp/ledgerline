'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.belongsToMany(models.Role, { through: models.UserRole, foreignKey: 'user_id', as: 'Roles' });
      User.hasMany(models.UserRole, { foreignKey: 'user_id' });
      User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'Role' });
      User.belongsTo(models.Entity, { foreignKey: 'entity_id' });

      User.belongsTo(models.Property, { foreignKey: 'property_id' });
      User.belongsTo(models.Client, { foreignKey: 'client_id', as: 'Client', constraints: false });
      User.hasMany(models.Asset, { foreignKey: 'created_by', as: 'CreatedAssets' });
      User.hasMany(models.AuditSession, { foreignKey: 'created_by' });
      User.hasMany(models.AuditScan, { foreignKey: 'scanned_by' });
    }

  }
  User.init({
    first_name: { type: DataTypes.STRING, allowNull: false },
    last_name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    employee_id: { type: DataTypes.STRING, unique: true, allowNull: false },
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    role_id: { type: DataTypes.INTEGER, allowNull: false },
    entity_id: DataTypes.INTEGER,
    property_id: DataTypes.INTEGER,
    client_id: DataTypes.INTEGER,
    full_name: {
      type: DataTypes.VIRTUAL,
      get() {
        return `${this.first_name || ''} ${this.last_name || ''}`.trim();
      }
    },
    user_level: { type: DataTypes.ENUM('Level 1', 'Level 2', 'Level 3', 'Level 4'), defaultValue: 'Level 1' },
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
    last_login: DataTypes.DATE,
    refresh_token_hash: DataTypes.STRING,
    mfa_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    receive_notifications: { type: DataTypes.BOOLEAN, defaultValue: false }, // per-tenant digest recipient flag
    mfa_secret: DataTypes.STRING,
    mfa_last_verified_at: DataTypes.DATE,
    reset_token: DataTypes.STRING,
    reset_token_expiry: DataTypes.DATE,
    failed_login_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    locked_until: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return User;
};
