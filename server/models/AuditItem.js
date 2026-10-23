'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditItem extends Model {
    static associate(models) {
      AuditItem.belongsTo(models.AuditSession, { foreignKey: 'audit_session_id' });
      AuditItem.belongsTo(models.Asset, { foreignKey: 'asset_id' });
    }
  }
  AuditItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    audit_session_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    expected_location_id: { type: DataTypes.INTEGER },
    found_location_id: { type: DataTypes.INTEGER },
    status: { 
      type: DataTypes.ENUM('PENDING', 'FOUND', 'MISSING', 'EXTRA'), 
      defaultValue: 'PENDING' 
    },
    scanned_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'AuditItem',
    tableName: 'audit_items',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return AuditItem;
};
