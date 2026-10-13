'use strict';
module.exports = (sequelize, DataTypes) => {
  const Employee = sequelize.define('Employee', {
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    emp_code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    doj: { type: DataTypes.DATEONLY, allowNull: true },
    designation: DataTypes.STRING(150),
    location: DataTypes.STRING(150),
    gender: DataTypes.STRING(20),
    rm_emp_code: DataTypes.STRING(50),
    rm_name: DataTypes.STRING(200),
    employment_type: DataTypes.STRING(50),
    company: DataTypes.STRING(150),
    sub_lob: DataTypes.STRING(150),
    lob: DataTypes.STRING(150),
    sbu: DataTypes.STRING(150),
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { tableName: 'employees', timestamps: true, underscored: true });
  Employee.associate = (models) => {
    if (models.User) Employee.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };
  return Employee;
};
