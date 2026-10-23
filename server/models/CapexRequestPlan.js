'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CapexRequestPlan extends Model {
    static associate(models) {
      CapexRequestPlan.belongsTo(models.Department, { foreignKey: 'department_id' });
      CapexRequestPlan.belongsTo(models.AssetCategory, { foreignKey: 'category_id' });
      CapexRequestPlan.belongsTo(models.PurchaseOrder, { foreignKey: 'linked_po_id' });
      CapexRequestPlan.belongsTo(models.GRN, { foreignKey: 'linked_grn_id' });
    }
  }

  CapexRequestPlan.init({
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    request_number: { type: DataTypes.STRING(100), allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    department_id: DataTypes.INTEGER,
    category_id: DataTypes.INTEGER,
    amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    threshold_level: { type: DataTypes.INTEGER, defaultValue: 1 },
    approval_stage: { type: DataTypes.INTEGER, defaultValue: 0 },
    required_approvals: { type: DataTypes.INTEGER, defaultValue: 1 },
    review_notes: DataTypes.TEXT,
    last_action_by: DataTypes.INTEGER,
    status: { type: DataTypes.ENUM('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PROCURED'), defaultValue: 'REQUESTED' },
    linked_po_id: DataTypes.INTEGER,
    linked_grn_id: DataTypes.INTEGER,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'CapexRequestPlan',
    tableName: 'capexrequests',
    freezeTableName: true,
    timestamps: false,
    underscored: true
  });

  return CapexRequestPlan;
};
