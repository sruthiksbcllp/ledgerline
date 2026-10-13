'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Department extends Model {
    static associate(models) {
      Department.hasMany(models.SubDepartment, { foreignKey: 'department_id' });
      Department.hasMany(models.Asset, { foreignKey: 'department_id' });
    }
  }
  Department.init({
    dept_name: { type: DataTypes.STRING, allowNull: false },
    dept_code: { type: DataTypes.STRING, unique: true, allowNull: false },
    numbering_code: { type: DataTypes.STRING(10), allowNull: true }, // the client numbering: short code in doc numbers (e.g. IT, ADM); falls back to dept_code
    description: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
    client_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      defaultValue: 1 
    }

  }, {
    sequelize,
    modelName: 'Department',
    tableName: 'departments',
    freezeTableName: true,
    timestamps: true,
  });
  return Department;
};
