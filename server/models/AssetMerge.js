'use strict';
module.exports = (sequelize, DataTypes) => {
  const AssetMerge = sequelize.define('AssetMerge', {
    client_id: DataTypes.INTEGER,
    merged_asset_id: { type: DataTypes.INTEGER, allowNull: false },
    source_asset_ids: { type: DataTypes.JSON, allowNull: false },
    total_cost: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    total_accumulated_depreciation: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
    merge_date: { type: DataTypes.DATEONLY, allowNull: false },
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER
  }, { tableName: 'asset_merges', timestamps: true, underscored: true, updatedAt: false });
  return AssetMerge;
};
