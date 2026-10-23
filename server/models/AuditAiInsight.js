'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditAiInsight extends Model {
    static associate(models) {
      AuditAiInsight.belongsTo(models.AuditSession, { foreignKey: 'audit_session_id' });
    }
  }
  AuditAiInsight.init({
    audit_session_id: { type: DataTypes.INTEGER, allowNull: false },
    summary: DataTypes.TEXT,
    risk_analysis_json: DataTypes.JSON,
    compliance_flags_json: DataTypes.JSON,
    ai_insights_json: DataTypes.JSON,
    recommended_actions_json: DataTypes.JSON,
    is_latest: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'AuditAiInsight',
    tableName: 'audit_ai_insights',
    freezeTableName: true,
    underscored: true
  });
  return AuditAiInsight;
};
