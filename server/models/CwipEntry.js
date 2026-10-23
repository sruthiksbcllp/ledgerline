'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CwipEntry extends Model {
    static associate(models) {
      CwipEntry.belongsTo(models.CwipProject, {
        foreignKey: 'project_id',
        as: 'project'
      });
      CwipEntry.belongsTo(models.Vendor, {
        foreignKey: 'vendor_id',
        as: 'vendor'
      });
    }
  }
  
  CwipEntry.init({
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    expense_type: {
      type: DataTypes.ENUM('Material', 'Labor', 'Installation', 'Other'),
      defaultValue: 'Material'
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    vendor_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    date: DataTypes.DATE,
    remarks: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'CwipEntry',
    tableName: 'cwip_entries',
    freezeTableName: true
  });
  
  return CwipEntry;
};
