'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UnknownTagLog extends Model {}
  UnknownTagLog.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tag_id: { type: DataTypes.STRING(100), allowNull: false },
    scanner_id: { type: DataTypes.STRING(50) },
    location_id: { type: DataTypes.INTEGER },
    scanned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    raw_payload: { type: DataTypes.JSON }
  }, {
    sequelize,
    modelName: 'UnknownTagLog',
    tableName: 'unknown_tag_logs',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return UnknownTagLog;
};
