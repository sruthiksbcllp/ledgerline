'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('FarPeriodLock', {
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    period_end: { type: DataTypes.DATEONLY, allowNull: false },
    locked_by: { type: DataTypes.INTEGER, allowNull: false },
    locked_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    digital_signature_hash: DataTypes.STRING(128),
    remarks: DataTypes.TEXT
  }, { tableName: 'far_period_locks', timestamps: false });
};
