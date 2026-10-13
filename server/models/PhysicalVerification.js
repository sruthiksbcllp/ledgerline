const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class PhysicalVerification extends Model {
    static associate(models) {
      this.belongsTo(models.AuditSchedule, { foreignKey: 'audit_id' });
      this.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      this.belongsTo(models.User, { foreignKey: 'verified_by' });
    }
  }

  PhysicalVerification.init({
    verified_date: { type: DataTypes.DATE },
    status: { 
      type: DataTypes.ENUM('PRESENT', 'MISSING', 'DAMAGED', 'LOCATION_MISMATCH'), 
      defaultValue: 'PRESENT' 
    },
    remarks: { type: DataTypes.TEXT }
  }, {
    sequelize,
    modelName: 'PhysicalVerification',
    tableName: 'physicalverifications',
    freezeTableName: true
  });

  return PhysicalVerification;
};
