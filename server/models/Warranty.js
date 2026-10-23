'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Warranty extends Model {
    static associate(models) {
      Warranty.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      Warranty.belongsTo(models.ServiceProvider, { foreignKey: 'service_provider_id' });
    }
  }
  Warranty.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    warranty_code: { type: DataTypes.STRING(50), unique: true, allowNull: false },
    service_provider_id: { type: DataTypes.INTEGER, allowNull: false },
    start_date: { type: DataTypes.DATE, allowNull: false },
    end_date: { type: DataTypes.DATE, allowNull: false },
    warranty_type: DataTypes.STRING(100),
    warranty_terms: DataTypes.TEXT,
    contact_person: DataTypes.STRING(255),
    contact_phone: DataTypes.STRING(20),
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Warranty',
    tableName: 'warranties',
    freezeTableName: true,
    timestamps: false
  });
  return Warranty;
};
