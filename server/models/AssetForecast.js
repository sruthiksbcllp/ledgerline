'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('AssetForecast', {
    client_id: DataTypes.INTEGER,
    forecast_name: { type: DataTypes.STRING, allowNull: false },
    forecast_type: { type: DataTypes.ENUM('REPLACEMENT','CAPEX','WHAT_IF'), defaultValue: 'REPLACEMENT' },
    parameters: DataTypes.JSON,
    results: DataTypes.JSON,
    horizon_years: { type: DataTypes.INTEGER, defaultValue: 5 },
    created_by: DataTypes.INTEGER
  }, { tableName: 'asset_forecasts', timestamps: true, underscored: true });
};
