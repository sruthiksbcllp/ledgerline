'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeaseJournalEntry extends Model {
    static associate(models) {
      LeaseJournalEntry.belongsTo(models.LeaseAgreement, { foreignKey: 'lease_id' });
    }
  }

  LeaseJournalEntry.init({
    lease_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    period_number: DataTypes.INTEGER,
    period_date: DataTypes.DATEONLY,
    entry_type: { type: DataTypes.ENUM('INITIAL_RECOGNITION', 'INTEREST', 'PAYMENT', 'AMORTIZATION'), allowNull: false },
    debit_account: DataTypes.STRING,
    credit_account: DataTypes.STRING,
    amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    narration: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'LeaseJournalEntry',
    tableName: 'leasejournalentries',
    freezeTableName: true,
    timestamps: false
  });

  return LeaseJournalEntry;
};
