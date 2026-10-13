const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class UserRole extends Model {}

  UserRole.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    role_id: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    sequelize,
    modelName: 'UserRole',
    tableName: 'user_roles',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });

  return UserRole;
};
