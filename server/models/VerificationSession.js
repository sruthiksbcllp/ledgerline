'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class VerificationSession extends Model {
    static associate(models) {
      VerificationSession.belongsTo(models.User, { foreignKey: 'auditor_id', as: 'Auditor' });
      VerificationSession.belongsTo(models.Location, { foreignKey: 'location_id' });
      VerificationSession.hasMany(models.VerificationDetail, { foreignKey: 'session_id' });
    }
  }
  VerificationSession.init({
    client_id: { type: DataTypes.INTEGER, allowNull: true }, // B1: tenant scope (backfilled from location; set on create)
    session_name: { type: DataTypes.STRING, allowNull: false },
    location_id: { type: DataTypes.INTEGER, allowNull: false },
    auditor_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { 
      type: DataTypes.ENUM('OPEN', 'CLOSED', 'APPROVED', 'REJECTED'), 
      defaultValue: 'OPEN' 
    },
    snapshot_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'VerificationSession',
    tableName: 'verificationsessions',
    freezeTableName: true,
    timestamps: true,
  });
  return VerificationSession;
};
