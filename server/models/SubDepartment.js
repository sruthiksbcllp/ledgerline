'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SubDepartment extends Model {
    static associate(models) {
      SubDepartment.belongsTo(models.Department, { foreignKey: 'department_id' });
      SubDepartment.hasMany(models.Asset, { foreignKey: 'sub_department_id' });
    }
  }
  SubDepartment.init({
    sub_dept_name: { type: DataTypes.STRING, allowNull: false },
    department_id: { type: DataTypes.INTEGER, allowNull: false },
    description: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'SubDepartment',
    tableName: 'subdepartments',
    freezeTableName: true,
    timestamps: false
  });
  return SubDepartment;
};
