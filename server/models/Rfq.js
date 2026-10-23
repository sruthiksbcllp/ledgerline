'use strict';
module.exports = (sequelize, DataTypes) => {
  const Rfq = sequelize.define('Rfq', {
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    rfq_number: { type: DataTypes.STRING },
    pr_id: { type: DataTypes.INTEGER, allowNull: true },
    title: { type: DataTypes.STRING },
    status: { type: DataTypes.ENUM('DRAFT','SENT','PARTIALLY_RESPONDED','CLOSED','CANCELLED'), defaultValue: 'DRAFT' },
    due_date: { type: DataTypes.DATE },
    remarks: { type: DataTypes.TEXT },
    created_by: { type: DataTypes.INTEGER }
  }, { tableName: 'rfqs', timestamps: true, underscored: true });
  Rfq.associate = (models) => {
    Rfq.hasMany(models.RfqItem, { foreignKey: 'rfq_id', as: 'items' });
    Rfq.hasMany(models.RfqVendor, { foreignKey: 'rfq_id', as: 'vendors' });
    Rfq.belongsTo(models.PurchaseRequisition, { foreignKey: 'pr_id', as: 'PR' });
  };
  return Rfq;
};
