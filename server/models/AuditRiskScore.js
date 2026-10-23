'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditRiskScore extends Model {
    static associate(models) {
      AuditRiskScore.belongsTo(models.AuditSession, { foreignKey: 'audit_session_id' });
    }
  }
  AuditRiskScore.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    audit_session_id: { type: DataTypes.INTEGER, allowNull: false },
    risk_type: { type: DataTypes.STRING, allowNull: false },
    severity: { type: DataTypes.ENUM('low', 'medium', 'high'), allowNull: false },
    score: { type: DataTypes.DECIMAL(5, 2), allowNull: false }
  }, {
    sequelize,
    modelName: 'AuditRiskScore',
    tableName: 'audit_risk_scores',
    freezeTableName: true,
    underscored: true
  });
  return AuditRiskScore;
};
