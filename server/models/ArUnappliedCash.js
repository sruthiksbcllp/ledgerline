'use strict';
const { Model } = require('sequelize');

/**
 * A customer payment not (yet) matched to an invoice: no remittance details, or more than the
 * invoices owed (blueprint O2C step 7). Banked to 1010 and held in 2060 until applied; anything left
 * for more than 5 days is flagged on the worklist and at the AR close.  OPEN -> APPLIED
 */
module.exports = (sequelize, DataTypes) => {
  class ArUnappliedCash extends Model {
    static associate(models) {
      ArUnappliedCash.belongsTo(models.ArCustomer, { foreignKey: 'customer_id', as: 'customer' });
      ArUnappliedCash.hasMany(models.ArReceipt, { foreignKey: 'unapplied_id', as: 'applications' });
    }
  }
  ArUnappliedCash.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    customer_id: { type: DataTypes.INTEGER, allowNull: true }, // null when the payer is not yet identified
    received_date: { type: DataTypes.DATEONLY, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    applied_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    payment_mode: { type: DataTypes.STRING(30), allowNull: true },
    reference: { type: DataTypes.STRING(100), allowNull: true },
    payer_name: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'OPEN' },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    remaining: {
      type: DataTypes.VIRTUAL,
      get() { return Math.max(0, Math.round((Number(this.amount || 0) - Number(this.applied_amount || 0)) * 100) / 100); }
    }
  }, {
    sequelize, modelName: 'ArUnappliedCash', tableName: 'ar_unapplied_cash', freezeTableName: true, underscored: true, timestamps: true
  });
  return ArUnappliedCash;
};
