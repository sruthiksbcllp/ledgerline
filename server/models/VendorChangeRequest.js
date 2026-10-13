const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class VendorChangeRequest extends Model {
    static associate(models) {
      VendorChangeRequest.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      VendorChangeRequest.belongsTo(models.User, { foreignKey: 'requested_by', as: 'Requester' });
      VendorChangeRequest.belongsTo(models.User, { foreignKey: 'approved_by', as: 'Approver' });
    }
  }

  VendorChangeRequest.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    change_type: { type: DataTypes.STRING(50), defaultValue: 'MASTER_CHANGE' },
    before_json: DataTypes.JSON,
    after_json: DataTypes.JSON,
    requested_by: DataTypes.INTEGER,
    requested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    approved_by: DataTypes.INTEGER,
    approved_at: DataTypes.DATE,
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
      defaultValue: 'PENDING'
    },
    decision_notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'VendorChangeRequest',
    tableName: 'vendor_change_requests',
    freezeTableName: true,
    underscored: true
  });

  return VendorChangeRequest;
};
