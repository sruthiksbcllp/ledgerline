'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserCompanyAssignment extends Model {
    static associate(models) {
      UserCompanyAssignment.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      UserCompanyAssignment.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }
  UserCompanyAssignment.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    is_primary: { type: DataTypes.BOOLEAN, defaultValue: false },
    access_level: {
      type: DataTypes.ENUM('VIEW_ONLY', 'EDIT', 'ADMIN'),
      defaultValue: 'EDIT'
    }
  }, {
    sequelize,
    tableName: 'user_company_assignments',
    modelName: 'UserCompanyAssignment',
    timestamps: true,
    underscored: true
  });
  return UserCompanyAssignment;
};
