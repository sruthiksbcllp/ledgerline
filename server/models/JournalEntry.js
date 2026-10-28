'use strict';
const { Model } = require('sequelize');

/**
 * A posted journal for one AP event (goods receipt, service receipt, invoice, payment, reversal).
 * dedupe_key (e.g. "INVOICE:42") is unique per company, so an event is never posted twice.
 * Who triggered it is copied at posting time, like the activity trail.
 */
module.exports = (sequelize, DataTypes) => {
  class JournalEntry extends Model {
    static associate(models) {
      JournalEntry.hasMany(models.JournalLine, { foreignKey: 'journal_entry_id', as: 'lines' });
      JournalEntry.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'vendor', constraints: false });
    }
  }
  JournalEntry.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    je_number: { type: DataTypes.STRING(30), allowNull: true },
    entry_date: { type: DataTypes.DATEONLY, allowNull: false },
    event_type: { type: DataTypes.STRING(30), allowNull: false },
    source_module: { type: DataTypes.STRING(20), allowNull: false },
    source_id: { type: DataTypes.INTEGER, allowNull: false },
    source_ref: { type: DataTypes.STRING(100), allowNull: true },
    dedupe_key: { type: DataTypes.STRING(80), allowNull: false },
    vendor_id: { type: DataTypes.INTEGER, allowNull: true },
    po_id: { type: DataTypes.INTEGER, allowNull: true },
    invoice_id: { type: DataTypes.INTEGER, allowNull: true },
    narration: { type: DataTypes.STRING(500), allowNull: true },
    total_debit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    total_credit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'POSTED' },
    reversal_of_id: { type: DataTypes.INTEGER, allowNull: true },
    posted_by: { type: DataTypes.INTEGER, allowNull: true },
    posted_by_name: { type: DataTypes.STRING(150), allowNull: true },
    posted_by_role: { type: DataTypes.STRING(100), allowNull: true },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'AUTO' }
  }, {
    sequelize,
    modelName: 'JournalEntry',
    tableName: 'journal_entries',
    freezeTableName: true,
    underscored: true
  });
  return JournalEntry;
};
