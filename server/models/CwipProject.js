'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CwipProject extends Model {
    static associate(models) {
      CwipProject.hasMany(models.CwipEntry, { foreignKey: 'project_id', as: 'entries' });
      CwipProject.hasOne(models.Asset, { foreignKey: 'cwip_project_id', as: 'capitalizedAsset' });
      CwipProject.hasMany(models.CwipMilestone, { foreignKey: 'project_id', as: 'milestones' });
      CwipProject.hasMany(models.CwipProjectAsset, { foreignKey: 'project_id', as: 'projectAssets' });
      CwipProject.belongsTo(models.Department, { foreignKey: 'department_id', as: 'department' });
      CwipProject.belongsTo(models.AssetCategory, { foreignKey: 'category_id', as: 'category' });
      CwipProject.belongsTo(models.Location, { foreignKey: 'location_id', as: 'location' });
    }
  }

  CwipProject.init({
    client_id: { type: DataTypes.INTEGER, allowNull: true, comment: 'Tenant isolation' },
    project_name: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    start_date: DataTypes.DATE,
    estimated_end_date: { type: DataTypes.DATEONLY, allowNull: true },
    status: {
      type: DataTypes.ENUM('PLANNING', 'PROCUREMENT', 'IN_PROGRESS', 'OPEN', 'CLOSED', 'CAPITALIZED'),
      defaultValue: 'PLANNING'
    },
    project_type: {
      type: DataTypes.ENUM('SINGLE_ASSET', 'MULTI_ASSET'),
      defaultValue: 'SINGLE_ASSET'
    },
    total_cost: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    percentage_complete: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    department_id: { type: DataTypes.INTEGER, allowNull: true },
    category_id: { type: DataTypes.INTEGER, allowNull: true },
    location_id: { type: DataTypes.INTEGER, allowNull: true },

    // Interest capitalization
    borrowing_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, comment: 'Weighted avg borrowing rate %' },
    interest_capitalized: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0, comment: 'Total interest added to cost' },
    interest_start_date: { type: DataTypes.DATEONLY, allowNull: true },
    interest_end_date: { type: DataTypes.DATEONLY, allowNull: true, comment: 'NULL = still accruing' }
  }, {
    sequelize,
    modelName: 'CwipProject',
    tableName: 'cwip_projects',
    freezeTableName: true
  });

  return CwipProject;
};
