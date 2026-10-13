'use strict';
module.exports = (sequelize, DataTypes) => {
  const SodViolation = sequelize.define('SodViolation', {
    client_id: DataTypes.INTEGER,
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    rule_id: { type: DataTypes.INTEGER, allowNull: false },
    action_performed: DataTypes.STRING(100),
    entity_type: DataTypes.STRING(50),
    entity_id: DataTypes.INTEGER,
    detected_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    resolved: { type: DataTypes.BOOLEAN, defaultValue: false },
    resolved_by: DataTypes.INTEGER,
    resolved_at: DataTypes.DATE
  }, { tableName: 'sod_violations', timestamps: false });
  SodViolation.associate = (models) => {
    SodViolation.belongsTo(models.SodConflictRule, { foreignKey: 'rule_id', as: 'rule' });
  };
  return SodViolation;
};
