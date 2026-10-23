const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class RolePermission extends Model {
    static associate(models) {
      RolePermission.belongsTo(models.Role, { foreignKey: 'role_id' });
    }
  }

  RolePermission.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    role_id: { type: DataTypes.INTEGER, allowNull: false },
    section: { type: DataTypes.STRING, allowNull: false },
    can_add: { type: DataTypes.BOOLEAN, defaultValue: false },
    can_edit: { type: DataTypes.BOOLEAN, defaultValue: false },
    can_delete: { type: DataTypes.BOOLEAN, defaultValue: false },
    can_view: { type: DataTypes.BOOLEAN, defaultValue: false }
  }, {
    sequelize,
    modelName: 'RolePermission',
    tableName: 'rolepermissions',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });

  return RolePermission;
};
