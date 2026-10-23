'use strict';
module.exports = (sequelize, DataTypes) => {
  const AssetRevaluation = sequelize.define('AssetRevaluation', {
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: DataTypes.INTEGER,
    revaluation_date: { type: DataTypes.DATEONLY, allowNull: false },
    previous_carrying_amount: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    fair_value: { type: DataTypes.DECIMAL(15,2), allowNull: false },
    surplus_deficit: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    revaluation_reserve: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    valuer_name: DataTypes.STRING,
    valuer_report_ref: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    gl_posted: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_by: DataTypes.INTEGER
  }, { tableName: 'asset_revaluations', timestamps: true, underscored: true });
  AssetRevaluation.associate = (models) => {
    AssetRevaluation.belongsTo(models.Asset, { foreignKey: 'asset_id' });
  };
  return AssetRevaluation;
};
