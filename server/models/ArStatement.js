'use strict';
const { Model } = require('sequelize');

/**
 * A customer statement of account for a period, as sent, and the customer's reply: the AR mirror of
 * the FDS vendor reconciliation (vendor statement vs AP ledger). Blueprint: statements sent monthly.
 * delivery: EMAILED | NOT_SENT ; response: PENDING | AGREED | DISPUTED
 */
module.exports = (sequelize, DataTypes) => {
  class ArStatement extends Model {
    static associate(models) {
      ArStatement.belongsTo(models.ArCustomer, { foreignKey: 'customer_id', as: 'customer' });
    }
  }
  ArStatement.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    period_from: { type: DataTypes.DATEONLY, allowNull: false },
    period_to: { type: DataTypes.DATEONLY, allowNull: false },
    opening_balance: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    closing_balance: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    sent_to: { type: DataTypes.STRING(255), allowNull: true },
    delivery: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'NOT_SENT' },
    delivery_note: { type: DataTypes.STRING(255), allowNull: true },
    response: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    customer_balance: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    difference: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    response_note: { type: DataTypes.STRING(500), allowNull: true },
    responded_at: { type: DataTypes.DATE, allowNull: true },
    recorded_by: { type: DataTypes.INTEGER, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize, modelName: 'ArStatement', tableName: 'ar_statements', freezeTableName: true, underscored: true, timestamps: true
  });
  return ArStatement;
};
