'use strict';
const { Model } = require('sequelize');

/** What the AI read on a bill vs what was submitted, and which fields a person corrected. */
module.exports = (sequelize, DataTypes) => {
  class ApAiReview extends Model {
    static associate(models) {
      ApAiReview.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice', constraints: false });
      ApAiReview.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'vendor', constraints: false });
    }
  }
  ApAiReview.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    vendor_id: { type: DataTypes.INTEGER, allowNull: true },
    invoice_id: { type: DataTypes.INTEGER, allowNull: true },
    bill_inbox_id: { type: DataTypes.INTEGER, allowNull: true },
    channel: { type: DataTypes.STRING(10), allowNull: false },
    auto_submitted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    read_values: { type: DataTypes.JSON, allowNull: true },
    submitted_values: { type: DataTypes.JSON, allowNull: true },
    corrected_fields: { type: DataTypes.JSON, allowNull: true }
  }, {
    sequelize,
    modelName: 'ApAiReview',
    tableName: 'ap_ai_reviews',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return ApAiReview;
};
