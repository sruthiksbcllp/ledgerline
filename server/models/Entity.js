'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Entity extends Model {
    static associate(models) {
      Entity.hasMany(models.User, { foreignKey: 'entity_id' });
      Entity.hasMany(models.EntityGstRegistration, { foreignKey: 'entity_id', as: 'gstRegistrations' });
    }
  }
  Entity.init({
    entity_name: { type: DataTypes.STRING, allowNull: false },
    entity_code: { type: DataTypes.STRING, unique: true },
    short_code: { type: DataTypes.STRING(10), allowNull: true }, // the client numbering: 2-5 letter prefix (e.g. NIM, NAAM)
    address: DataTypes.TEXT,
    gst_number: DataTypes.STRING,
    client_id: { type: DataTypes.INTEGER, allowNull: true } // Phase A - NULL = global/shared; set = tenant-owned
  }, {
    sequelize,
    modelName: 'Entity',
    tableName: 'entities',
    freezeTableName: true,
    timestamps: false
  });
  return Entity;
};
