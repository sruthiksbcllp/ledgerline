const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class AuditSchedule extends Model {
    static associate(models) {
      this.belongsTo(models.Location, { foreignKey: 'location_id' });
      this.hasMany(models.PhysicalVerification, { foreignKey: 'audit_id' });
    }
  }

  AuditSchedule.init({
    title: { type: DataTypes.STRING, allowNull: false },
    start_date: { type: DataTypes.DATE },
    end_date: { type: DataTypes.DATE },
    status: { 
      type: DataTypes.ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'), 
      defaultValue: 'SCHEDULED' 
    }
  }, {
    sequelize,
    modelName: 'AuditSchedule',
    tableName: 'auditschedules',
    freezeTableName: true
  });

  return AuditSchedule;
};
