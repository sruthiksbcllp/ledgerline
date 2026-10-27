const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Vendor extends Model {
    static associate(models) {
      this.hasMany(models.PurchaseOrder, { foreignKey: 'vendor_id' });
      this.hasMany(models.Invoice, { foreignKey: 'vendor_id' });
      this.belongsTo(models.User, { foreignKey: 'verified_by', as: 'Verifier', constraints: false });
    }
  }

  Vendor.init({
    vendor_name: { type: DataTypes.STRING, allowNull: false },
    procurement_type: { type: DataTypes.STRING(30), allowNull: true }, // CR-P04
    vendor_code: { type: DataTypes.STRING, unique: true },
    gst_number: { type: DataTypes.STRING(15) },
    pan_number: { type: DataTypes.STRING(10), unique: true },
    contact_person: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    address: { type: DataTypes.TEXT },
    bank_name: { type: DataTypes.STRING },
    bank_account_no: { type: DataTypes.STRING, unique: true },
    ifsc_code: { type: DataTypes.STRING },
    gst_registered_state_code: { type: DataTypes.STRING(2) },
    gst_expiry_date: { type: DataTypes.DATE },
    msme_expiry_date: { type: DataTypes.DATE },
    pan_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    compliance_score: { type: DataTypes.INTEGER, defaultValue: 100 },
    compliance_last_checked: { type: DataTypes.DATE },
    contract_expiry_date: { type: DataTypes.DATE },
    compliance_docs_expiry_date: { type: DataTypes.DATE },
    compliance_risk_score: { type: DataTypes.INTEGER, defaultValue: 0 },
    compliance_risk_band: { type: DataTypes.ENUM('BLUE', 'GOLD', 'ORANGE', 'RED'), defaultValue: 'BLUE' },
    tds_section_code: { type: DataTypes.STRING(20) },
    tds_rate_percent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 2 },
    gstin_status: { type: DataTypes.STRING(30), defaultValue: 'UNVERIFIED' },
    gstin_validated_at: { type: DataTypes.DATE },
    status: { type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'BLACKLISTED'), defaultValue: 'DRAFT' },
    // Compliance Team review of the details the vendor submitted (set only via PUT /vendors/:id/verification)
    verification_status: { type: DataTypes.ENUM('PENDING', 'VERIFIED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
    verified_by: { type: DataTypes.INTEGER, allowNull: true },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    verification_remarks: { type: DataTypes.STRING(500), allowNull: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
  }, {
    sequelize,
    modelName: 'Vendor',
    tableName: 'vendors',
    freezeTableName: true
  });

  return Vendor;
};
