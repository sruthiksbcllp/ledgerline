'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeaseSchedule extends Model {
    static associate(models) {
      LeaseSchedule.belongsTo(models.LeaseAgreement, { foreignKey: 'lease_id' });
    }
  }

  LeaseSchedule.init({
    lease_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    period_number: DataTypes.INTEGER,
    period_date: DataTypes.DATEONLY,
    opening_liability: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    payment_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    interest_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    principal_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    closing_liability: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    rou_opening_value: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    rou_amortization: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    rou_closing_value: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    due_in_days: { type: DataTypes.INTEGER, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'LeaseSchedule',
    tableName: 'leaseschedules',
    freezeTableName: true,
    timestamps: false
  });

  return LeaseSchedule;
};
