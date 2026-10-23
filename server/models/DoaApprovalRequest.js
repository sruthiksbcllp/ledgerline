'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DoaApprovalRequest extends Model {
    static associate(models) {
      DoaApprovalRequest.hasMany(models.DoaApprovalStep, { foreignKey: 'request_id', as: 'steps' });
    }
  }
  DoaApprovalRequest.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    module: { type: DataTypes.STRING(30), allowNull: false },
    document_id: { type: DataTypes.INTEGER, allowNull: false },
    expense_type: { type: DataTypes.ENUM('CAPEX', 'OPEX'), allowNull: true },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    policy_id: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.ENUM('IN_PROGRESS', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'IN_PROGRESS' },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, { sequelize, modelName: 'DoaApprovalRequest', tableName: 'doa_approval_requests', freezeTableName: true, timestamps: true });
  return DoaApprovalRequest;
};
