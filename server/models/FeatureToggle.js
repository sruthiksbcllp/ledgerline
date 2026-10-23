'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FeatureToggle extends Model {
    static associate(models) {}
  }
  FeatureToggle.init({
    client_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    feature_key: { type: DataTypes.STRING, allowNull: false },
    feature_name: { type: DataTypes.STRING, allowNull: true },
    module: { type: DataTypes.STRING, allowNull: true },
    is_enabled: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'FeatureToggle',
    tableName: 'featuretoggles',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return FeatureToggle;
};
