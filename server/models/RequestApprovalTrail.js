'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RequestApprovalTrail extends Model {
    static associate(models) {
      RequestApprovalTrail.belongsTo(models.Request, { foreignKey: 'request_id' });
      RequestApprovalTrail.belongsTo(models.User, { foreignKey: 'approver_id' });
    }
  }
  RequestApprovalTrail.init({
    request_id: { type: DataTypes.INTEGER, allowNull: false },
    approver_id: { type: DataTypes.INTEGER, allowNull: false },
    approval_level: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.ENUM('APPROVED', 'REJECTED'), allowNull: false },
    remarks: DataTypes.TEXT,
    actioned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'RequestApprovalTrail',
    tableName: 'requestapprovaltrails',
    freezeTableName: true,
    timestamps: false
  });
  return RequestApprovalTrail;
};
