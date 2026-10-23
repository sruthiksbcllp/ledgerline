const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class VendorAsset extends Model {
    static associate(models) {
      VendorAsset.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
      VendorAsset.belongsTo(models.Asset, { foreignKey: 'asset_id', as: 'asset' });
    }
  }

  VendorAsset.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_name: { type: DataTypes.STRING, allowNull: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    sequelize,
    modelName: 'VendorAsset',
    tableName: 'vendor_assets',
    freezeTableName: true,
    timestamps: false
  });

  return VendorAsset;
};
