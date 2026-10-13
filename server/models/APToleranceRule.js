const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class APToleranceRule extends Model {}

  APToleranceRule.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    rule_name: { type: DataTypes.STRING(100), allowNull: false },
    tolerance_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 5 },
    tolerance_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    applies_to: { type: DataTypes.ENUM('QTY', 'AMOUNT', 'BOTH'), allowNull: false, defaultValue: 'BOTH' },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, {
    sequelize,
    modelName: 'APToleranceRule',
    tableName: 'ap_tolerance_rules',
    underscored: true
  });

  return APToleranceRule;
};

