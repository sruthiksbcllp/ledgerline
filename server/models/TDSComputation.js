'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TDSComputation extends Model {
    static associate(models) {
      TDSComputation.belongsTo(models.Invoice, { foreignKey: 'invoice_id' });
      TDSComputation.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
    }
  }
  TDSComputation.init({
    invoice_id: DataTypes.INTEGER,
    vendor_id: DataTypes.INTEGER,
    client_id: DataTypes.INTEGER,
    section_code: DataTypes.STRING(20),
    tds_rate: DataTypes.DECIMAL(5, 2),
    tds_amount: DataTypes.DECIMAL(15, 2),
    is_206ab_applicable: DataTypes.BOOLEAN,
    status: DataTypes.ENUM('COMPUTED', 'APPLIED', 'REVERSED')
  }, {
    sequelize,
    modelName: 'TDSComputation',
    tableName: 'tds_computations',
    underscored: true,
    updatedAt: false,
    freezeTableName: true
  });
  return TDSComputation;
};

