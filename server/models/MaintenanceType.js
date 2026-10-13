'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MaintenanceType extends Model {
    static associate(models) {
      MaintenanceType.hasMany(models.AssetMaintenance, { foreignKey: 'maintenance_type_id' });
    }
  }
  MaintenanceType.init({
    type_name: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    code: DataTypes.STRING,
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
  }, {
    sequelize,
    modelName: 'MaintenanceType',
    tableName: 'maintenancetypes',
    freezeTableName: true,
    timestamps: false
  });
  return MaintenanceType;
};
