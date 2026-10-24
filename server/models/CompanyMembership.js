'use strict';
const { Model } = require('sequelize');

/** A user's access to one company (client). See services/companyAccess.service.js. */
module.exports = (sequelize, DataTypes) => {
  class CompanyMembership extends Model {
    static associate(models) {
      CompanyMembership.belongsTo(models.User, { foreignKey: 'user_id', as: 'User', constraints: false });
      CompanyMembership.belongsTo(models.Client, { foreignKey: 'client_id', as: 'Client', constraints: false });
      CompanyMembership.belongsTo(models.User, { foreignKey: 'decided_by', as: 'DecidedBy', constraints: false });
    }
  }
  CompanyMembership.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    // A role code from config/rbac.js (ADMIN, MANAGER, REQUESTER, FINANCE, ...).
    role_code: { type: DataTypes.STRING(50), allowNull: false },
    status: { type: DataTypes.ENUM('ACTIVE', 'PENDING', 'REJECTED', 'REVOKED'), allowNull: false, defaultValue: 'ACTIVE' },
    requested_role: { type: DataTypes.STRING(50), allowNull: true },
    request_note: { type: DataTypes.STRING(500), allowNull: true },
    decided_by: { type: DataTypes.INTEGER, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    decision_note: { type: DataTypes.STRING(500), allowNull: true },
    last_used_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'CompanyMembership',
    tableName: 'company_memberships',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return CompanyMembership;
};
