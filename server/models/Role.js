const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Role extends Model {
    static associate(models) {
      Role.belongsToMany(models.User, { 
        through: models.UserRole,
        foreignKey: 'role_id'
      });
      Role.hasMany(models.UserRole, { foreignKey: 'role_id' });
      Role.hasMany(models.RolePermission, { foreignKey: 'role_id' });

    }
  }

  Role.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING, unique: true, allowNull: false }, // e.g., 'SUPER_ADMIN'
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING },
    level: { type: DataTypes.INTEGER, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'Role',
    tableName: 'roles',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  });

  return Role;
};
