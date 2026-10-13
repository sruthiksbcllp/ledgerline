'use strict';
module.exports = (sequelize, DataTypes) => {
  const VendorCategory = sequelize.define('VendorCategory', {
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    category_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER }
  }, { tableName: 'vendor_categories', timestamps: true, underscored: true });
  VendorCategory.associate = (models) => {
    VendorCategory.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
    VendorCategory.belongsTo(models.AssetCategory, { foreignKey: 'category_id', as: 'category' });
  };
  return VendorCategory;
};
