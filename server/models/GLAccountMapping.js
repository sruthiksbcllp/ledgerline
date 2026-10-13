'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('GLAccountMapping', {
    client_id: DataTypes.INTEGER,
    category_id: DataTypes.INTEGER,
    cost_center_id: DataTypes.INTEGER,
    event_type: { type: DataTypes.ENUM('ACQUISITION','DEPRECIATION','DISPOSAL','TRANSFER','REVALUATION'), allowNull: false },
    debit_account_code: { type: DataTypes.STRING(50), allowNull: false },
    debit_account_name: DataTypes.STRING,
    credit_account_code: { type: DataTypes.STRING(50), allowNull: false },
    credit_account_name: DataTypes.STRING,
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { tableName: 'gl_account_mappings', timestamps: true, underscored: true });
};
