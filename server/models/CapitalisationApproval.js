'use strict';
/**
 * CapitalisationApproval (CR-N07) — approvable document for the capitalisation gate.
 * Mutable block mirrors FT-002 PR/PO so the existing engine drives it unchanged.
 * Frozen block is the event snapshot; a beforeUpdate hook rejects changes to it.
 */
module.exports = (sequelize, DataTypes) => {
  const FROZEN = ['client_id','source_type','source_ref','amount','dedupe_key',
                  'event_date','fiscal_year','period_month','journal_payload','created_by'];
  const CapitalisationApproval = sequelize.define('CapitalisationApproval', {
    // ── frozen snapshot (write-once) ──
    client_id:       { type: DataTypes.INTEGER, allowNull: false },
    source_type:     { type: DataTypes.STRING(30), allowNull: false },
    source_ref:      { type: DataTypes.STRING(64), allowNull: false },
    amount:          { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    dedupe_key:      { type: DataTypes.STRING(190), allowNull: false },
    event_date:      { type: DataTypes.DATEONLY, allowNull: false },
    fiscal_year:     { type: DataTypes.STRING(16) },
    period_month:    { type: DataTypes.INTEGER },
    journal_payload: { type: DataTypes.JSON, allowNull: false },
    created_by:      { type: DataTypes.INTEGER },
    // ── approval state (mutable; written by FT-002 engine + release) ──
    status: { type: DataTypes.ENUM('PENDING_APPROVAL','IN_APPROVAL','APPROVED','REJECTED','CANCELLED','PENDING_CONFIGURATION'),
              allowNull: false, defaultValue: 'PENDING_APPROVAL' },
    workflow_id:            { type: DataTypes.INTEGER },
    current_level:          { type: DataTypes.INTEGER, defaultValue: 0 },
    current_approval_level: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_approval_levels:  { type: DataTypes.INTEGER, defaultValue: 0 },
    status_lock:            { type: DataTypes.BOOLEAN, defaultValue: false },
    is_fully_approved:      { type: DataTypes.BOOLEAN, defaultValue: false },
    approval_date:          { type: DataTypes.DATE },
    released_queue_id:      { type: DataTypes.INTEGER },
  }, { tableName: 'capitalisation_approvals', underscored: true, timestamps: true });

  CapitalisationApproval.addHook('beforeUpdate', (inst) => {
    for (const f of FROZEN) {
      if (inst.changed(f)) throw new Error(`CapitalisationApproval.${f} is immutable (frozen at creation)`);
    }
  });
  CapitalisationApproval.associate = (models) => {
    CapitalisationApproval.belongsTo(models.ApprovalWorkflow, { foreignKey: 'workflow_id', as: 'Workflow' });
  };
  return CapitalisationApproval;
};
