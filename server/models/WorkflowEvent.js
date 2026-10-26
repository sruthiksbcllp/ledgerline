'use strict';
const { Model } = require('sequelize');

/**
 * One step in a document's life: who did what, when, and the status it moved to. Written by the
 * hooks in services/workflowTrail.service.js on every create and status change of the AP
 * documents (PR, RFQ, quotation, PO, gate entry, GRN, SES, invoice, payment, debit note).
 * The person's name and role are copied at the time of the action, so later renames or role
 * changes never rewrite history.
 */
module.exports = (sequelize, DataTypes) => {
  class WorkflowEvent extends Model {}
  WorkflowEvent.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    module: { type: DataTypes.STRING(30), allowNull: false },
    reference_id: { type: DataTypes.INTEGER, allowNull: false },
    reference_no: { type: DataTypes.STRING(100), allowNull: true },
    action: { type: DataTypes.STRING(120), allowNull: false },
    from_status: { type: DataTypes.STRING(60), allowNull: true },
    to_status: { type: DataTypes.STRING(60), allowNull: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    user_name: { type: DataTypes.STRING(160), allowNull: true },
    role_code: { type: DataTypes.STRING(60), allowNull: true },
    role_name: { type: DataTypes.STRING(120), allowNull: true },
    comments: { type: DataTypes.TEXT, allowNull: true },
    details: { type: DataTypes.JSON, allowNull: true },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'APP' },
    occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'WorkflowEvent',
    tableName: 'workflow_events',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return WorkflowEvent;
};
