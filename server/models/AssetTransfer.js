'use strict';
module.exports = (sequelize, DataTypes) => {
  const AssetTransfer = sequelize.define('AssetTransfer', {
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: DataTypes.INTEGER,
    from_company_id: DataTypes.INTEGER,
    to_company_id: DataTypes.INTEGER,
    transfer_date: { type: DataTypes.DATEONLY, allowNull: false },
    transfer_value: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    nbv_at_transfer: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    gain_loss: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    transfer_reason: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('PENDING','APPROVED','COMPLETED','REJECTED'), defaultValue: 'PENDING' },
    approved_by: DataTypes.INTEGER,
    approved_at: DataTypes.DATE,
    gl_posted: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_by: DataTypes.INTEGER
  }, { tableName: 'asset_transfers', timestamps: true, underscored: true });
  AssetTransfer.associate = (models) => {
    AssetTransfer.belongsTo(models.Asset, { foreignKey: 'asset_id' });
  };
  return AssetTransfer;
};
