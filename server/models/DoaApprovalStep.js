'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DoaApprovalStep extends Model {
    static associate(models) {
      DoaApprovalStep.belongsTo(models.DoaApprovalRequest, { foreignKey: 'request_id', as: 'request' });
    }
  }
  DoaApprovalStep.init({
    request_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    seq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }, // approvers grouped into levels; levels sequential, within-level parallel
    requirement_type: { type: DataTypes.ENUM('SINGLE', 'ANY_ONE_OF'), allowNull: false },
    spec_type: { type: DataTypes.STRING(40), allowNull: true },
    approver_name: { type: DataTypes.STRING(120), allowNull: true },
    approver_email: { type: DataTypes.STRING(160), allowNull: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    group_key: { type: DataTypes.STRING(60), allowNull: true },
    eligible_json: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
    decided_email: { type: DataTypes.STRING(160), allowNull: true },
    decided_user_id: { type: DataTypes.INTEGER, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    decided_ip: { type: DataTypes.STRING(64), allowNull: true },
    comment: { type: DataTypes.TEXT, allowNull: true }
  }, { sequelize, modelName: 'DoaApprovalStep', tableName: 'doa_approval_steps', freezeTableName: true, timestamps: true });
  return DoaApprovalStep;
};
