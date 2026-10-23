'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DoaSlabApprover extends Model {
    static associate(models) {
      DoaSlabApprover.belongsTo(models.DoaPolicySlab, { foreignKey: 'slab_id', as: 'slab' });
    }
  }
  DoaSlabApprover.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    slab_id: { type: DataTypes.INTEGER, allowNull: false },
    spec_type: { type: DataTypes.ENUM('NAMED', 'ROLE', 'DYNAMIC_INITIATOR_HEAD', 'DYNAMIC_FACILITATOR_HEAD', 'ANY_ONE_OF_GROUP', 'MANUAL'), allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: true },        // internal FixTag user
    approver_name: { type: DataTypes.STRING(120), allowNull: true },  // external approver name
    approver_email: { type: DataTypes.STRING(160), allowNull: true }, // external approver email (no FixTag login)
    role_code: { type: DataTypes.STRING(40), allowNull: true },
    group_key: { type: DataTypes.STRING(60), allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    is_dedup: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { sequelize, modelName: 'DoaSlabApprover', tableName: 'doa_slab_approvers', freezeTableName: true, timestamps: true });
  return DoaSlabApprover;
};
