const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class VendorRiskHistory extends Model {
    static associate(models) {
      VendorRiskHistory.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      VendorRiskHistory.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
    }
  }

  VendorRiskHistory.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    event_type: {
      type: DataTypes.ENUM('RISK_CALCULATED', 'DOCUMENT_UPLOADED', 'REMINDER_CREATED', 'APPROVAL_SUBMITTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'VENDOR_UPDATED'),
      allowNull: false
    },
    old_band: DataTypes.STRING(20),
    new_band: DataTypes.STRING(20),
    old_score: DataTypes.INTEGER,
    new_score: DataTypes.INTEGER,
    summary: { type: DataTypes.STRING, allowNull: false },
    details_json: DataTypes.JSON,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'VendorRiskHistory',
    tableName: 'vendor_risk_history',
    freezeTableName: true,
    underscored: true
  });

  return VendorRiskHistory;
};
