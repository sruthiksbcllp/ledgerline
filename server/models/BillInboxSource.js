'use strict';
const { Model } = require('sequelize');

/** A user's connected Outlook mailbox that LedgerLine checks for vendor bills. */
module.exports = (sequelize, DataTypes) => {
  class BillInboxSource extends Model {
    static associate(models) {
      BillInboxSource.belongsTo(models.User, { foreignKey: 'user_id', as: 'owner', constraints: false });
    }
  }
  BillInboxSource.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    mailbox_email: { type: DataTypes.STRING(255), allowNull: true },
    // LIKELY_BILLS: only mail from known vendors or that looks like a bill. ALL_ATTACHMENTS: every
    // email with a PDF or image (for a mailbox used only for bills).
    mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'LIKELY_BILLS' },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    checked_until: { type: DataTypes.DATE, allowNull: true },
    last_checked_at: { type: DataTypes.DATE, allowNull: true },
    last_error: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    sequelize,
    modelName: 'BillInboxSource',
    tableName: 'bill_inbox_sources',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return BillInboxSource;
};
