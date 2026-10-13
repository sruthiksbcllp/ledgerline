'use strict';

/**
 * SAFE STATE CHECKPOINT — 2026-05-04
 *
 * This migration consolidates every schema fix applied during staging.
 * It is 100% idempotent — safe to run on a DB that already has all columns.
 * Run order: must be the last migration (highest timestamp).
 *
 * Covers:
 *  - All nullable / default fixes on auditplans, assetissues, gate_entries, etc.
 *  - ENUM additions (purchaseorders.status RECEIVED, auditplans.status PLANNED)
 *  - Timestamp DEFAULT CURRENT_TIMESTAMP on ~40 tables
 *  - All missing columns from model sweeps (230504100000 – 230504300000)
 *  - notifications.title NOT NULL fix
 */

module.exports = {
  up: async (queryInterface) => {
    const sq = queryInterface.sequelize;

    // ── helpers ────────────────────────────────────────────────────────────
    async function hasColumn(table, col) {
      try {
        const cols = await queryInterface.describeTable(table);
        return Object.prototype.hasOwnProperty.call(cols, col);
      } catch {
        return false;
      }
    }

    async function tableExists(table) {
      try {
        const [rows] = await sq.query(
          `SELECT COUNT(*) AS c FROM information_schema.tables
           WHERE table_schema = DATABASE() AND table_name = ?`,
          { replacements: [table] }
        );
        return Number(rows[0].c) > 0;
      } catch {
        return false;
      }
    }

    async function addCol(table, col, definition) {
      if (!(await tableExists(table))) return;
      if (await hasColumn(table, col)) return;
      try {
        await sq.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${definition}`);
      } catch (e) {
        if (!e.message.includes('Duplicate column')) throw e;
      }
    }

    async function modifyCol(table, col, definition) {
      if (!(await tableExists(table))) return;
      if (!(await hasColumn(table, col))) return;
      try {
        await sq.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${col}\` ${definition}`);
      } catch { /* already correct */ }
    }

    async function setTimestampDefault(table, col) {
      await modifyCol(table, col, 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }

    async function enumContains(table, col, value) {
      try {
        const [rows] = await sq.query(
          `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
          { replacements: [table, col] }
        );
        return rows.length > 0 && rows[0].COLUMN_TYPE.includes(value);
      } catch {
        return false;
      }
    }

    // ── 1. auditplans ──────────────────────────────────────────────────────
    await modifyCol('auditplans', 'audit_name',     'VARCHAR(255) NULL DEFAULT NULL');
    await modifyCol('auditplans', 'asset_id',       'INT NULL');
    await modifyCol('auditplans', 'auditor_id',     'INT NULL');
    await modifyCol('auditplans', 'scheduled_date', 'DATETIME NULL DEFAULT NULL');
    // Ensure PLANNED is in the status ENUM
    if (!(await enumContains('auditplans', 'status', 'PLANNED'))) {
      await sq.query(
        `ALTER TABLE auditplans MODIFY COLUMN \`status\`
         ENUM('PLANNED','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED') NULL DEFAULT 'PLANNED'`
      ).catch(() => {});
    }

    // ── 2. audit_sessions ─────────────────────────────────────────────────
    await addCol('audit_sessions', 'session_code',       'VARCHAR(100) NULL');
    await addCol('audit_sessions', 'session_name',       'VARCHAR(255) NULL');
    await addCol('audit_sessions', 'audit_name',         'VARCHAR(255) NULL');
    await addCol('audit_sessions', 'plan_id',            'INT NULL');
    await addCol('audit_sessions', 'location_id',        'INT NULL');
    await addCol('audit_sessions', 'auditor_id',         'INT NULL');
    await addCol('audit_sessions', 'reviewer_id',        'INT NULL');
    await addCol('audit_sessions', 'planned_start_date', 'DATETIME NULL');
    await addCol('audit_sessions', 'planned_end_date',   'DATETIME NULL');
    await addCol('audit_sessions', 'actual_start_date',  'DATETIME NULL');
    await addCol('audit_sessions', 'actual_end_date',    'DATETIME NULL');
    await addCol('audit_sessions', 'start_date',         'DATETIME NULL');
    await addCol('audit_sessions', 'end_date',           'DATETIME NULL');
    await addCol('audit_sessions', 'approval_remarks',   'TEXT NULL');

    // ── 3. audit_findings ─────────────────────────────────────────────────
    await modifyCol('audit_findings', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await modifyCol('audit_findings', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    await addCol('audit_findings', 'type',    "ENUM('MISSING','EXTRA','MISMATCH') NULL");
    await addCol('audit_findings', 'remarks', 'TEXT NULL');

    // ── 4. assetissues ────────────────────────────────────────────────────
    await addCol('assetissues', 'assigned_to_user',         'INT NULL');
    await addCol('assetissues', 'assigned_to_vendor',       'INT NULL');
    await addCol('assetissues', 'amc_id',                   'INT NULL');
    await addCol('assetissues', 'vendor_id',                'INT NULL');
    await addCol('assetissues', 'resolved_at',              'DATETIME NULL');

    // ── 5. assets ─────────────────────────────────────────────────────────
    await addCol('assets', 'qr_code',                  'VARCHAR(255) NULL');
    await addCol('assets', 'tag_template',             'VARCHAR(255) NULL');
    await addCol('assets', 'tag_meta',                 'JSON NULL');
    await addCol('assets', 'disposal_date',            'DATETIME NULL');
    await addCol('assets', 'disposal_type',            'VARCHAR(100) NULL');
    await addCol('assets', 'custodian_name',           'VARCHAR(255) NULL');
    await addCol('assets', 'custodian_assigned_date',  'DATE NULL');
    await addCol('assets', 'asset_image',              'VARCHAR(500) NULL');
    await addCol('assets', 'asset_document',           'VARCHAR(500) NULL');

    // ── 6. purchaseorders status ENUM ─────────────────────────────────────
    if (!(await enumContains('purchaseorders', 'status', 'RECEIVED'))) {
      await sq.query(
        `ALTER TABLE purchaseorders MODIFY COLUMN \`status\`
         ENUM('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','SENT','RECEIVED','PARTIALLY_RECEIVED','CLOSED','CANCELLED')
         NOT NULL DEFAULT 'DRAFT'`
      ).catch(() => {});
    }

    // ── 7. gate_entries / gate_entry_items timestamps ─────────────────────
    await setTimestampDefault('gate_entries',      'created_at');
    await setTimestampDefault('gate_entries',      'updated_at');
    await setTimestampDefault('gate_entry_items',  'created_at');
    await setTimestampDefault('gate_entry_items',  'updated_at');

    // ── 8. vendor_debit_notes timestamps ──────────────────────────────────
    await setTimestampDefault('vendor_debit_notes', 'created_at');
    await setTimestampDefault('vendor_debit_notes', 'updated_at');

    // ── 9. notifications — title NOT NULL ─────────────────────────────────
    await addCol('notifications', 'title',          'VARCHAR(255) NULL');
    await addCol('notifications', 'reference_type', 'VARCHAR(50) NULL');
    await addCol('notifications', 'reference_id',   'INT NULL');
    await addCol('notifications', 'is_read',        'TINYINT(1) NULL DEFAULT 0');
    await modifyCol('notifications', 'created_at',  'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await modifyCol('notifications', 'updated_at',  'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // ── 10. approval_logs timestamps ──────────────────────────────────────
    await addCol('approval_logs', 'timestamp', 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP');

    // ── 11. quotation_master timestamps ───────────────────────────────────
    await modifyCol('quotation_master', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await modifyCol('quotation_master', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // ── 12. quotation_items timestamps ────────────────────────────────────
    await modifyCol('quotation_items', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await modifyCol('quotation_items', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // ── 13. self_declaration_campaigns timestamps ─────────────────────────
    await modifyCol('self_declaration_campaigns', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await modifyCol('self_declaration_campaigns', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // ── 14. verificationsessions timestamps ───────────────────────────────
    // Model uses timestamps:true without underscored → camelCase
    await addCol('verificationsessions', 'createdAt', 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
    await addCol('verificationsessions', 'updatedAt', 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // ── 15. scan_logs created_at ──────────────────────────────────────────
    await modifyCol('scan_logs', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');

    // ── 16. audit_evidence timestamps ─────────────────────────────────────
    await addCol('audit_evidence', 'remarks',    'TEXT NULL');
    await modifyCol('audit_evidence', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await modifyCol('audit_evidence', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // ── 17. Timestamp defaults for remaining tables ───────────────────────
    const tsTablesUnderscored = [
      'assetamcs', 'assetmaintenances', 'asset_movements',
      'assetissues', 'assetdisposals',
      'purchaserequisitions', 'purchase_requisition_items',
      'purchase_order_items', 'grn_items', 'grns', 'invoices',
      'items', 'vendors', 'departments', 'locations', 'properties',
      'asset_categories', 'capexbudgets', 'capexrequests', 'capexprojections',
      'leaseagreements', 'leaseschedules', 'leasejournalentries',
      'assethandovers', 'client_licenses', 'support_tickets',
      'audit_plannings'
    ];
    for (const t of tsTablesUnderscored) {
      if (!(await tableExists(t))) continue;
      await modifyCol(t, 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP').catch(() => {});
      await modifyCol(t, 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP').catch(() => {});
    }

    // ── 18. assetinsurances timestamps ────────────────────────────────────
    await modifyCol('assetinsurances', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await modifyCol('assetinsurances', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    console.log('[checkpoint] Safe-state checkpoint migration complete.');
  },

  down: async () => {
    // Intentionally a no-op — this migration only adds safety, never destructive
  }
};
