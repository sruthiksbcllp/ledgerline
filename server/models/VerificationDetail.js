'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class VerificationDetail extends Model {
    static associate(models) {
      VerificationDetail.belongsTo(models.VerificationSession, { foreignKey: 'session_id' });
      VerificationDetail.belongsTo(models.Item, { foreignKey: 'item_id' });
    }
  }
  VerificationDetail.init({
    session_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    system_qty: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    physical_qty: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    variance: { 
      type: DataTypes.VIRTUAL,
      get() {
        return this.physical_qty - this.system_qty;
      }
    },
    is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    verified_at: DataTypes.DATE,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'VerificationDetail',
    tableName: 'verificationdetails',
    freezeTableName: true,
    timestamps: true,
  });
  return VerificationDetail;
};
