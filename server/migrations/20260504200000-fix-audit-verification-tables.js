'use strict';

/**
 * 20260504200000-fix-audit-verification-tables.js
 *
 * Fixes column mismatches for:
 * 1. verification_sessions  — missing location_id, auditor_id, session_name, snapshot_date, notes, status
 * 2. audit_tasks            — missing type, source, reference_value, risk_value, location, status, assigned_to, created_at
 * 3. audit_sessions         — missing audit_name, location_id, auditor_id, plan_id, client_id, status, property_id,
 *                             planned_start_date, planned_end_date, actual_start_date, actual_end_date,
 *                             created_by, reviewer_id, approval_remarks
 * 4. audit_plans            — missing plan_name, location_id, frequency, risk_level, assigned_to, status,
 *                             created_by, remarks
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableExists = async (table) => {
      try { await queryInterface.describeTable(table); return true; }
      catch (_) { return false; }
    };
    const addIfMissing = async (table, col, def) => {
      try {
        if (!(await tableExists(table))) return;
        const desc = await queryInterface.describeTable(table);
        if (!desc[col]) await queryInterface.addColumn(table, col, def);
      } catch (_) {}
    };

    // ── verification_sessions ─────────────────────────────────────────────────
    await addIfMissing('verification_sessions', 'session_name',   { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('verification_sessions', 'location_id',    { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('verification_sessions', 'auditor_id',     { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('verification_sessions', 'status', {
      type: Sequelize.ENUM('OPEN', 'CLOSED', 'APPROVED', 'REJECTED'), defaultValue: 'OPEN'
    });
    await addIfMissing('verification_sessions', 'snapshot_date',  { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('verification_sessions', 'notes',          { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('verification_sessions', 'client_id',      { type: Sequelize.INTEGER, allowNull: true });

    // ── audit_tasks ───────────────────────────────────────────────────────────
    await addIfMissing('audit_tasks', 'type', {
      type: Sequelize.ENUM('INVESTIGATION', 'AUDIT', 'VERIFICATION'), allowNull: true
    });
    await addIfMissing('audit_tasks', 'source',           { type: Sequelize.STRING(100), defaultValue: 'DASHBOARD' });
    await addIfMissing('audit_tasks', 'reference_value',  { type: Sequelize.INTEGER, defaultValue: 0 });
    await addIfMissing('audit_tasks', 'risk_value',       { type: Sequelize.DECIMAL(20, 2), defaultValue: 0 });
    await addIfMissing('audit_tasks', 'location',         { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('audit_tasks', 'status', {
      type: Sequelize.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED'), defaultValue: 'PENDING'
    });
    await addIfMissing('audit_tasks', 'assigned_to',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_tasks', 'created_at',       { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('audit_tasks', 'client_id',        { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_tasks', 'session_id',       { type: Sequelize.INTEGER, allowNull: true });

    // ── audit_sessions ────────────────────────────────────────────────────────
    await addIfMissing('audit_sessions', 'plan_id',          { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_sessions', 'client_id',        { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('audit_sessions', 'audit_name',       { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('audit_sessions', 'location_id',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_sessions', 'auditor_id',       { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_sessions', 'status', {
      type: Sequelize.ENUM('PLANNED','SCHEDULED','IN_PROGRESS','COMPLETED','REVIEW','CLOSED','REJECTED','CANCELLED'),
      defaultValue: 'PLANNED'
    });
    await addIfMissing('audit_sessions', 'property_id',         { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_sessions', 'planned_start_date',  { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('audit_sessions', 'planned_end_date',    { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('audit_sessions', 'actual_start_date',   { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('audit_sessions', 'actual_end_date',     { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('audit_sessions', 'created_by',          { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_sessions', 'reviewer_id',         { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_sessions', 'approval_remarks',    { type: Sequelize.TEXT, allowNull: true });

    // ── audit_plans ───────────────────────────────────────────────────────────
    await addIfMissing('audit_plans', 'plan_name',   { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('audit_plans', 'location_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_plans', 'frequency', {
      type: Sequelize.ENUM('ANNUAL', 'QUARTERLY', 'MONTHLY'), defaultValue: 'ANNUAL'
    });
    await addIfMissing('audit_plans', 'risk_level', {
      type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH'), defaultValue: 'LOW'
    });
    await addIfMissing('audit_plans', 'assigned_to', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_plans', 'status', {
      type: Sequelize.ENUM('PLANNED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'), defaultValue: 'PLANNED'
    });
    await addIfMissing('audit_plans', 'created_by', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_plans', 'remarks',    { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('audit_plans', 'client_id',  { type: Sequelize.INTEGER, allowNull: true });
  },

  down: async () => {}
};
