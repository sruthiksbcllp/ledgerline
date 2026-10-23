'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArReminder extends Model {
    static associate(models) {
      ArReminder.belongsTo(models.ArInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
    }
  }
  ArReminder.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    invoice_id: { type: DataTypes.INTEGER, allowNull: false },
    to_email: { type: DataTypes.STRING(255), allowNull: true },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    delivery: { type: DataTypes.ENUM('EMAILED', 'NOT_SENT'), allowNull: false, defaultValue: 'NOT_SENT' },
    delivery_note: { type: DataTypes.STRING(255), allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'ArReminder',
    tableName: 'ar_reminders',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ArReminder;
};
