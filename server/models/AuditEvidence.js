'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditEvidence extends Model {
    static associate(models) {
      AuditEvidence.belongsTo(models.AuditSession, { foreignKey: 'audit_session_id' });
      AuditEvidence.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AuditEvidence.belongsTo(models.User, { foreignKey: 'created_by' });
    }
  }
  AuditEvidence.init({
    audit_session_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    image_url: { type: DataTypes.STRING, allowNull: false },
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AuditEvidence',
    tableName: 'audit_evidence',
    freezeTableName: true,
    underscored: true
  });
  return AuditEvidence;
};
