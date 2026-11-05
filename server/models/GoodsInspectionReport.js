'use strict';
const { Model } = require('sequelize');

/** Goods Inspection Report (GIR) for a GRN: checklist, per-line findings, result and inspection note. */
module.exports = (sequelize, DataTypes) => {
  class GoodsInspectionReport extends Model {
    static associate(models) {
      GoodsInspectionReport.belongsTo(models.GRN, { foreignKey: 'grn_id', as: 'grn', constraints: false });
      GoodsInspectionReport.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id', as: 'po', constraints: false });
      GoodsInspectionReport.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'vendor', constraints: false });
    }
  }
  GoodsInspectionReport.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    gir_number: { type: DataTypes.STRING(50), allowNull: false },
    grn_id: { type: DataTypes.INTEGER, allowNull: false },
    po_id: { type: DataTypes.INTEGER, allowNull: true },
    vendor_id: { type: DataTypes.INTEGER, allowNull: true },
    inspection_date: { type: DataTypes.DATEONLY, allowNull: false },
    result: { type: DataTypes.STRING(30), allowNull: false },
    checklist: { type: DataTypes.JSON, allowNull: true },
    line_findings: { type: DataTypes.JSON, allowNull: true },
    inspection_note: { type: DataTypes.TEXT, allowNull: false },
    inspected_by: { type: DataTypes.INTEGER, allowNull: true },
    inspected_by_name: { type: DataTypes.STRING(150), allowNull: true }
  }, {
    sequelize,
    modelName: 'GoodsInspectionReport',
    tableName: 'goods_inspection_reports',
    freezeTableName: true,
    underscored: true
  });
  return GoodsInspectionReport;
};
