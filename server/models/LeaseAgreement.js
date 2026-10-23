'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeaseAgreement extends Model {
    static associate(models) {
      LeaseAgreement.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      LeaseAgreement.hasMany(models.LeaseSchedule, { foreignKey: 'lease_id', as: 'schedule' });
      LeaseAgreement.hasMany(models.LeaseJournalEntry, { foreignKey: 'lease_id', as: 'journals' });
    }
  }

  LeaseAgreement.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    ownership_type: { type: DataTypes.ENUM('OWNED', 'LEASED'), defaultValue: 'OWNED' },
    lessor_name: DataTypes.STRING,
    lease_start_date: DataTypes.DATEONLY,
    lease_end_date: DataTypes.DATEONLY,
    monthly_payment: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    interest_rate: { type: DataTypes.DECIMAL(8, 4), defaultValue: 0 },
    lease_type: { type: DataTypes.ENUM('FINANCE', 'OPERATING'), defaultValue: 'FINANCE' },
    renewal_option: DataTypes.TEXT,
    termination_option: DataTypes.TEXT,
    early_termination_penalty: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    rou_asset_value: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    lease_liability_value: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    status: { type: DataTypes.ENUM('ACTIVE', 'TERMINATED', 'EXPIRED'), defaultValue: 'ACTIVE' },
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'LeaseAgreement',
    tableName: 'leaseagreements',
    freezeTableName: true,
    timestamps: true,
    underscored: true
  });

  return LeaseAgreement;
};
