const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Permission extends Model {
    static associate(models) {
      // Associations to Role via RolePermission removed due to schema mismatch
    }
  }

  Permission.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    module: { type: DataTypes.STRING, allowNull: false }, // e.g., 'PR', 'ASSET'
    action: { type: DataTypes.STRING, allowNull: false }, // e.g., 'CREATE', 'VIEW'
    name: { 
      type: DataTypes.VIRTUAL,
      get() { return `${this.module}:${this.action}`; }
    }
  }, {
    sequelize,
    modelName: 'Permission',
    tableName: 'permissions',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  });

  return Permission;
};
