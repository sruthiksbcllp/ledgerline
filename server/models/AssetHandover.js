'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetHandover extends Model {
    static associate(models) {
      AssetHandover.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AssetHandover.belongsTo(models.User, { as: 'FromUser', foreignKey: 'from_user_id' });
      AssetHandover.belongsTo(models.User, { as: 'ToUser', foreignKey: 'to_user_id' });
      AssetHandover.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
    }
  }

  AssetHandover.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    from_user_id: DataTypes.INTEGER,
    from_user_name: DataTypes.STRING(200),
    to_user_id: { type: DataTypes.INTEGER, allowNull: false },
    to_user_name: DataTypes.STRING(200),
    handover_date: { type: DataTypes.DATEONLY, allowNull: false },
    condition_at_handover: { type: DataTypes.ENUM('GOOD', 'FAIR', 'POOR'), defaultValue: 'GOOD' },
    remarks: DataTypes.TEXT,
    acknowledged: { type: DataTypes.BOOLEAN, defaultValue: false },
    acknowledged_at: DataTypes.DATE,
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    created_by: DataTypes.INTEGER,
    created_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'AssetHandover',
    tableName: 'assethandovers',
    freezeTableName: true,
    timestamps: false
  });

  return AssetHandover;
};
