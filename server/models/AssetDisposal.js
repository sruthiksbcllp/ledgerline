'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetDisposal extends Model {
    static associate(models) {
      AssetDisposal.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AssetDisposal.belongsTo(models.User, { foreignKey: 'approved_by', as: 'Approver' });
      AssetDisposal.belongsTo(models.User, { foreignKey: 'created_by', as: 'Requester' });
    }
  }
  AssetDisposal.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    disposal_type: { 
      type: DataTypes.ENUM('SALE', 'SCRAP', 'DONATION', 'THEFT', 'DESTRUCTION'), 
      allowNull: false 
    },
    disposal_date: { type: DataTypes.DATE, allowNull: false },
    book_value: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    sale_value: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    gain_loss: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    status: { 
      type: DataTypes.ENUM('REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'), 
      defaultValue: 'REQUESTED' 
    },
    approved_by: DataTypes.INTEGER,
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AssetDisposal',
    tableName: 'assetdisposals',
    freezeTableName: true,
    timestamps: true,
  });
  return AssetDisposal;
};
