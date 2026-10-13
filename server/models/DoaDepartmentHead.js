'use strict';
module.exports = (sequelize, DataTypes) => {
  const DoaDepartmentHead = sequelize.define('DoaDepartmentHead', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    department_id: { type: DataTypes.INTEGER, allowNull: false },
    sublob_head_name: { type: DataTypes.STRING(120), allowNull: true },
    sublob_head_email: { type: DataTypes.STRING(160), allowNull: true },
    facilitator_head_name: { type: DataTypes.STRING(120), allowNull: true },
    facilitator_head_email: { type: DataTypes.STRING(160), allowNull: true },
  }, { sequelize, modelName: 'DoaDepartmentHead', tableName: 'doa_department_heads', freezeTableName: true, timestamps: true });
  return DoaDepartmentHead;
};
