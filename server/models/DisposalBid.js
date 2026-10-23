'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('DisposalBid', {
    disposal_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    bidder_name: { type: DataTypes.STRING, allowNull: false },
    bid_amount: { type: DataTypes.DECIMAL(15,2), allowNull: false },
    bid_date: DataTypes.DATEONLY,
    is_selected: { type: DataTypes.BOOLEAN, defaultValue: false },
    remarks: DataTypes.TEXT
  }, { tableName: 'disposal_bids', timestamps: true, underscored: true, updatedAt: false });
};
