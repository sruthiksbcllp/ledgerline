const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class VendorComplianceSnapshot extends Model {
    static associate(models) {
      VendorComplianceSnapshot.belongsTo(models.User, { foreignKey: 'generated_by', as: 'GeneratedBy' });
    }
  }

  VendorComplianceSnapshot.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    fy: { type: DataTypes.STRING(20), allowNull: false },
    snapshot_date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    generated_by: { type: DataTypes.INTEGER },
    total_vendors: { type: DataTypes.INTEGER, defaultValue: 0 },
    red_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    orange_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    gold_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    blue_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_spend: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    snapshot_json: { type: DataTypes.JSON }
  }, {
    sequelize,
    modelName: 'VendorComplianceSnapshot',
    tableName: 'vendor_compliance_snapshots',
    freezeTableName: true,
    underscored: true
  });

  return VendorComplianceSnapshot;
};
