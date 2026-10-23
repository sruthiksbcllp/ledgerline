'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CapexProjection extends Model {
    static associate(models) {
      CapexProjection.belongsTo(models.CapexRequestPlan, { foreignKey: 'capex_request_id' });
      CapexProjection.belongsTo(models.AssetCategory, { foreignKey: 'asset_category_id' });
    }
  }

  CapexProjection.init({
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    capex_request_id: DataTypes.INTEGER,
    asset_category_id: DataTypes.INTEGER,
    projection_month: { type: DataTypes.DATEONLY, allowNull: false },
    projected_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    projected_depreciation: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'CapexProjection',
    tableName: 'capexprojections',
    freezeTableName: true,
    timestamps: false,
    underscored: true
  });

  return CapexProjection;
};
