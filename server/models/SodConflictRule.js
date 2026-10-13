'use strict';
module.exports = (sequelize, DataTypes) => {
  const SodConflictRule = sequelize.define('SodConflictRule', {
    client_id: DataTypes.INTEGER,
    action_a: { type: DataTypes.STRING(100), allowNull: false },
    action_b: { type: DataTypes.STRING(100), allowNull: false },
    description: DataTypes.STRING(500),
    severity: { type: DataTypes.ENUM('WARNING','BLOCK'), defaultValue: 'BLOCK' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { tableName: 'sod_conflict_rules', timestamps: true, underscored: true, updatedAt: false });
  SodConflictRule.associate = (models) => {
    SodConflictRule.hasMany(models.SodViolation, { foreignKey: 'rule_id', as: 'violations' });
  };
  return SodConflictRule;
};
