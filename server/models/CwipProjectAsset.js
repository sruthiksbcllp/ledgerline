'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CwipProjectAsset extends Model {
    static associate(models) {
      CwipProjectAsset.belongsTo(models.CwipProject, { foreignKey: 'project_id', as: 'project' });
      CwipProjectAsset.belongsTo(models.Asset, { foreignKey: 'asset_id', as: 'asset' });
      CwipProjectAsset.belongsTo(models.AssetCategory, { foreignKey: 'category_id', as: 'category' });
    }
  }

  CwipProjectAsset.init({
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    asset_id: { type: DataTypes.INTEGER, allowNull: true, comment: 'NULL until capitalized' },
    asset_name: { type: DataTypes.STRING(255), allowNull: false },
    category_id: { type: DataTypes.INTEGER, allowNull: true },
    estimated_cost: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    actual_cost: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('PLANNED', 'IN_PROGRESS', 'CAPITALIZED'),
      defaultValue: 'PLANNED'
    },
    capitalized_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'CwipProjectAsset',
    tableName: 'cwip_project_assets',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return CwipProjectAsset;
};
