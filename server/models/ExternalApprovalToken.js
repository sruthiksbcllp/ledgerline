'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ExternalApprovalToken extends Model {
    static associate(_models) { /* bound by token_hash / (module, document_id) */ }
  }
  ExternalApprovalToken.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    module: { type: DataTypes.STRING(30), allowNull: false },
    document_id: { type: DataTypes.INTEGER, allowNull: false },
    approval_log_id: { type: DataTypes.INTEGER, allowNull: true },
    step_id: { type: DataTypes.INTEGER, allowNull: true },
    approver_email: { type: DataTypes.STRING(160), allowNull: false },
    approver_name: { type: DataTypes.STRING(120), allowNull: true },
    purpose: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'DOA_APPROVAL' },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    consumed_at: { type: DataTypes.DATE, allowNull: true },
    decision: { type: DataTypes.ENUM('APPROVED', 'REJECTED'), allowNull: true },
    decided_ip: { type: DataTypes.STRING(64), allowNull: true },
    decided_comment: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, { sequelize, modelName: 'ExternalApprovalToken', tableName: 'external_approval_tokens', freezeTableName: true, timestamps: true });
  return ExternalApprovalToken;
};
