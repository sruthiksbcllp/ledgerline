'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DoaPolicy extends Model {
    static associate(models) {
      DoaPolicy.hasMany(models.DoaPolicySlab, { foreignKey: 'policy_id', as: 'slabs' });
    }
  }
  DoaPolicy.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    expense_type: { type: DataTypes.ENUM('CAPEX', 'OPEX'), allowNull: false },
    org_level: { type: DataTypes.ENUM('SUB_LOB', 'LOB'), allowNull: false },
    department_id: { type: DataTypes.INTEGER, allowNull: true }, // route by department (IT/Admin); NULL = any
    name: { type: DataTypes.STRING(120), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { sequelize, modelName: 'DoaPolicy', tableName: 'doa_policies', freezeTableName: true, timestamps: true });
  return DoaPolicy;
};
