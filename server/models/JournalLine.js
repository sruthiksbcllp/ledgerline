'use strict';
const { Model } = require('sequelize');

/** One debit or credit line of a journal entry. The account name is kept as it was when posted. */
module.exports = (sequelize, DataTypes) => {
  class JournalLine extends Model {
    static associate(models) {
      JournalLine.belongsTo(models.JournalEntry, { foreignKey: 'journal_entry_id', as: 'entry' });
    }
  }
  JournalLine.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    journal_entry_id: { type: DataTypes.INTEGER, allowNull: false },
    line_no: { type: DataTypes.INTEGER, allowNull: false },
    account_code: { type: DataTypes.STRING(20), allowNull: false },
    account_name: { type: DataTypes.STRING(150), allowNull: false },
    debit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    credit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    memo: { type: DataTypes.STRING(255), allowNull: true },
    vendor_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'JournalLine',
    tableName: 'journal_lines',
    freezeTableName: true,
    underscored: true
  });
  return JournalLine;
};
