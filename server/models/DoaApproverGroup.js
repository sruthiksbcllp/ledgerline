'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DoaApproverGroup extends Model {
    static associate(_models) { /* queried by (client_id, group_key) */ }
  }
  DoaApproverGroup.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    group_key: { type: DataTypes.STRING(60), allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: true },            // internal FixTag user (optional)
    approver_name: { type: DataTypes.STRING(120), allowNull: true },  // external member name
    approver_email: { type: DataTypes.STRING(160), allowNull: true }  // external member email
  }, { sequelize, modelName: 'DoaApproverGroup', tableName: 'doa_approver_groups', freezeTableName: true, timestamps: true });
  return DoaApproverGroup;
};
