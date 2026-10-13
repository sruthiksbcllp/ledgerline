'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DoaPolicySlab extends Model {
    static associate(models) {
      DoaPolicySlab.belongsTo(models.DoaPolicy, { foreignKey: 'policy_id', as: 'policy' });
      DoaPolicySlab.hasMany(models.DoaSlabApprover, { foreignKey: 'slab_id', as: 'approvers' });
    }
  }
  DoaPolicySlab.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    policy_id: { type: DataTypes.INTEGER, allowNull: false },
    seq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    min_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    max_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    label: { type: DataTypes.STRING(120), allowNull: true }
  }, { sequelize, modelName: 'DoaPolicySlab', tableName: 'doa_policy_slabs', freezeTableName: true, timestamps: true });
  return DoaPolicySlab;
};
