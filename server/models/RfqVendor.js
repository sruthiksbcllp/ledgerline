'use strict';
module.exports = (sequelize, DataTypes) => {
  const RfqVendor = sequelize.define('RfqVendor', {
    rfq_id: { type: DataTypes.INTEGER, allowNull: false },
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER },
    invite_status: { type: DataTypes.ENUM('PENDING','SENT','RESPONDED','DECLINED'), defaultValue: 'PENDING' },
    email_sent_at: { type: DataTypes.DATE },
    response_quotation_id: { type: DataTypes.INTEGER }
  }, { tableName: 'rfq_vendors', timestamps: true, underscored: true });
  RfqVendor.associate = (models) => {
    RfqVendor.belongsTo(models.Rfq, { foreignKey: 'rfq_id' });
    RfqVendor.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
    RfqVendor.belongsTo(models.Quotation, { foreignKey: 'response_quotation_id', as: 'response' });
  };
  return RfqVendor;
};
