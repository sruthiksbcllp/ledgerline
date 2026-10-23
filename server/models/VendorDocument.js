const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class VendorDocument extends Model {
    static associate(models) {
      VendorDocument.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      VendorDocument.belongsTo(models.User, { foreignKey: 'uploaded_by', as: 'Uploader' });
    }
  }

  VendorDocument.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    document_type: {
      type: DataTypes.ENUM('GST', 'PAN', 'CONTRACT', 'MSME', 'INSURANCE', 'COMPLIANCE', 'OTHER'),
      defaultValue: 'OTHER'
    },
    document_name: { type: DataTypes.STRING, allowNull: false },
    file_name: { type: DataTypes.STRING },
    file_path: { type: DataTypes.TEXT },
    mime_type: { type: DataTypes.STRING },
    file_size: { type: DataTypes.INTEGER },
    expiry_date: { type: DataTypes.DATE },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'EXPIRING', 'EXPIRED', 'ARCHIVED'),
      defaultValue: 'ACTIVE'
    },
    uploaded_by: { type: DataTypes.INTEGER },
    remarks: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'VendorDocument',
    tableName: 'vendor_documents',
    freezeTableName: true,
    underscored: true
  });

  return VendorDocument;
};
