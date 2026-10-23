'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MaintenanceRecord extends Model {
    static associate(models) {
      MaintenanceRecord.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      MaintenanceRecord.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
    }
  }
  MaintenanceRecord.init({
    asset_id: DataTypes.INTEGER,
    type: { type: DataTypes.ENUM('AMC', 'WARRANTY', 'SERVICE') },
    vendor_id: DataTypes.INTEGER,
    start_date: DataTypes.DATE,
    end_date: DataTypes.DATE,
    cost: DataTypes.DECIMAL(15, 2),
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'MaintenanceRecord',
    tableName: 'maintenance_records',
    freezeTableName: true,
    underscored: true
  });
  return MaintenanceRecord;
};
