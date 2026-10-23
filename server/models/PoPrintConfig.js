'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PoPrintConfig extends Model {
    static associate(models) {
      PoPrintConfig.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client', constraints: false });
      PoPrintConfig.belongsTo(models.Entity, { foreignKey: 'entity_id', as: 'entity', constraints: false });
    }
  }
  PoPrintConfig.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    entity_id: { type: DataTypes.INTEGER, allowNull: true },
    company_name: { type: DataTypes.STRING(255) },
    registered_address: { type: DataTypes.TEXT },
    gst_number: { type: DataTypes.STRING(20) },
    pan_number: { type: DataTypes.STRING(15) },
    isd_number: { type: DataTypes.STRING(50) },
    logo_url: { type: DataTypes.STRING(500) },
    logo_data: { type: DataTypes.BLOB('long'), allowNull: true },
    logo_mime: { type: DataTypes.STRING(100), allowNull: true },
    terms_conditions: { type: DataTypes.TEXT },
    default_warranty: { type: DataTypes.STRING(255) },
    default_payment_terms: { type: DataTypes.STRING(255) },
    show_pr_number: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },        // #5 the client: hide PR No on PO print
    show_quotation_number: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // #5 the client: hide Quotation No on PO print
    requested_by_label: { type: DataTypes.STRING(100), defaultValue: 'Requested by' },
    approved_by_label: { type: DataTypes.STRING(100), defaultValue: 'PO approved by' },
    footer_note: { type: DataTypes.TEXT },
    procurement_cc_email: { type: DataTypes.STRING(255), allowNull: true }, // CFG-02 - fixed CC inbox for PO-to-vendor emails
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'PoPrintConfig',
    tableName: 'po_print_config',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return PoPrintConfig;
};
