'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EntityGstRegistration extends Model {
    static associate(models) {
      EntityGstRegistration.belongsTo(models.Entity, { foreignKey: 'entity_id', as: 'Entity' });
    }
  }
  EntityGstRegistration.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    entity_id: { type: DataTypes.INTEGER, allowNull: false },
    gstin: { type: DataTypes.STRING(15), allowNull: false, unique: true },
    state_code: { type: DataTypes.STRING(2), allowNull: true },
    state_name: { type: DataTypes.STRING(60), allowNull: true },
    pan: { type: DataTypes.STRING(10), allowNull: true },
    taxpayer_type: { type: DataTypes.STRING(40), allowNull: true }, // REGULAR / SEZ / ISD / COMPOSITION
    reg_date: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: true },        // ACTIVE / SURRENDERED
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, {
    sequelize,
    modelName: 'EntityGstRegistration',
    tableName: 'entity_gst_registrations',
    freezeTableName: true,
    timestamps: true
  });
  return EntityGstRegistration;
};
