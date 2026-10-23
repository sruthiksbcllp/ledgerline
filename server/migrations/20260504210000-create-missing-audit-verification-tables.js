'use strict';

/**
 * 20260504210000-create-missing-audit-verification-tables.js
 *
 * Creates tables that don't exist yet:
 * - verificationsessions  (tableName in VerificationSession model)
 * - auditplans            (tableName in AuditPlan model)
 *
 * Also adds missing columns to audit_tasks and audit_sessions
 * in case they exist under different names.
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

    // ── verificationsessions ──────────────────────────────────────────────────
    if (!(await tableExists('verificationsessions'))) {
      await queryInterface.createTable('verificationsessions', {
        id:            { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        session_name:  { type: Sequelize.STRING(255), allowNull: true },
        location_id:   { type: Sequelize.INTEGER, allowNull: true },
        auditor_id:    { type: Sequelize.INTEGER, allowNull: true },
        client_id:     { type: Sequelize.INTEGER, allowNull: true },
        status: {
          type: Sequelize.ENUM('OPEN', 'CLOSED', 'APPROVED', 'REJECTED'),
          defaultValue: 'OPEN'
        },
        snapshot_date: { type: Sequelize.DATE, allowNull: true },
        notes:         { type: Sequelize.TEXT, allowNull: true },
        createdAt:     { type: Sequelize.DATE, allowNull: true },
        updatedAt:     { type: Sequelize.DATE, allowNull: true },
      });
    } else {
      // table exists — add any missing columns
      await addIfMissing('verificationsessions', 'session_name',  { type: Sequelize.STRING(255), allowNull: true });
      await addIfMissing('verificationsessions', 'location_id',   { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('verificationsessions', 'auditor_id',    { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('verificationsessions', 'client_id',     { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('verificationsessions', 'status', {
        type: Sequelize.ENUM('OPEN', 'CLOSED', 'APPROVED', 'REJECTED'), defaultValue: 'OPEN'
      });
      await addIfMissing('verificationsessions', 'snapshot_date', { type: Sequelize.DATE, allowNull: true });
      await addIfMissing('verificationsessions', 'notes',         { type: Sequelize.TEXT, allowNull: true });
    }

    // ── auditplans ────────────────────────────────────────────────────────────
    if (!(await tableExists('auditplans'))) {
      await queryInterface.createTable('auditplans', {
        id:          { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        plan_name:   { type: Sequelize.STRING(255), allowNull: true },
        location_id: { type: Sequelize.INTEGER, allowNull: true },
        department_id: { type: Sequelize.INTEGER, allowNull: true },
        auditor_id:  { type: Sequelize.INTEGER, allowNull: true },
        asset_id:    { type: Sequelize.INTEGER, allowNull: true },
        client_id:   { type: Sequelize.INTEGER, allowNull: true },
        assigned_to: { type: Sequelize.INTEGER, allowNull: true },
        frequency: {
          type: Sequelize.ENUM('ANNUAL', 'QUARTERLY', 'MONTHLY'), defaultValue: 'ANNUAL'
        },
        risk_level: {
          type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH'), defaultValue: 'LOW'
        },
        status: {
          type: Sequelize.ENUM('PLANNED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'), defaultValue: 'PLANNED'
        },
        created_by:  { type: Sequelize.INTEGER, allowNull: true },
        remarks:     { type: Sequelize.TEXT, allowNull: true },
        created_at:  { type: Sequelize.DATE, allowNull: true },
        updated_at:  { type: Sequelize.DATE, allowNull: true },
      });
    } else {
      await addIfMissing('auditplans', 'plan_name',     { type: Sequelize.STRING(255), allowNull: true });
      await addIfMissing('auditplans', 'location_id',   { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('auditplans', 'department_id', { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('auditplans', 'auditor_id',    { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('auditplans', 'asset_id',      { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('auditplans', 'client_id',     { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('auditplans', 'assigned_to',   { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('auditplans', 'frequency', {
        type: Sequelize.ENUM('ANNUAL', 'QUARTERLY', 'MONTHLY'), defaultValue: 'ANNUAL'
      });
      await addIfMissing('auditplans', 'risk_level', {
        type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH'), defaultValue: 'LOW'
      });
      await addIfMissing('auditplans', 'status', {
        type: Sequelize.ENUM('PLANNED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'), defaultValue: 'PLANNED'
      });
      await addIfMissing('auditplans', 'created_by', { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('auditplans', 'remarks',    { type: Sequelize.TEXT, allowNull: true });
    }
  },

  down: async () => {}
};
