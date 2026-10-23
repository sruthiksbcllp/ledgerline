'use strict';

/**
 * 20260504100000-fix-staging-500-errors.js
 *
 * Fixes all recurring 500 errors on staging:
 *
 * 1. audit_notifications — table was created with wrong columns (session_id, user_id)
 *    but AuditNotification model and getNotifications() query audit_session_id,
 *    target_role, client_id, metadata, type. Drops and recreates with correct schema.
 *    This is the PRIMARY cause of the 500 storm on every page refresh (bell icon hits
 *    GET /api/audit-sessions/notifications on mount).
 *
 * 2. globalsettings — original migration created table as 'GlobalSettings' (PascalCase).
 *    Model uses tableName: 'globalsettings' (lowercase). On case-sensitive Linux MySQL/MariaDB
 *    this causes ER_NO_SUCH_TABLE. Creates lowercase alias table if missing.
 *    Also adds columns added after original migration (allow_excel_export, allow_pdf_export,
 *    enabled_features) if they don't exist.
 *
 * 3. approval_matrix — adds module_name + role_code columns if missing (added by model
 *    but not present in original schema, causing Sequelize projection errors on INSERT).
 *
 * All operations are safe to re-run (IF NOT EXISTS / column existence checks).
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // ── HELPER: check if a column exists ────────────────────────────────────
    const hasColumn = async (table, column) => {
      try {
        const desc = await queryInterface.describeTable(table);
        return Object.prototype.hasOwnProperty.call(desc, column);
      } catch (_) {
        return false;
      }
    };

    // ── HELPER: check if a table exists ─────────────────────────────────────
    const tableExists = async (table) => {
      try {
        await queryInterface.describeTable(table);
        return true;
      } catch (_) {
        return false;
      }
    };

    // ────────────────────────────────────────────────────────────────────────
    // FIX 1: audit_notifications — rebuild with correct schema
    // ────────────────────────────────────────────────────────────────────────
    //
    // Old schema (from 20260501210000): session_id, user_id, message, is_read
    // Correct schema (from AuditNotification model):
    //   audit_session_id, type, message, target_role, is_read, client_id, metadata
    //
    // Since the table has no valuable persistent data (it's a transient notification queue),
    // we drop and recreate cleanly.
    //
    const auditNotifExists = await tableExists('audit_notifications');
    if (auditNotifExists) {
      // Check if it has the wrong schema (old: session_id column present)
      const hasOldColumn = await hasColumn('audit_notifications', 'session_id');
      const hasNewColumn = await hasColumn('audit_notifications', 'audit_session_id');

      if (hasOldColumn && !hasNewColumn) {
        // Old wrong schema — drop and recreate
        await queryInterface.dropTable('audit_notifications');
        await queryInterface.createTable('audit_notifications', {
          id:               { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
          audit_session_id: { type: Sequelize.INTEGER, allowNull: true },
          type:             {
                              type: Sequelize.ENUM('CRITICAL', 'WARNING', 'REMINDER', 'INFO'),
                              defaultValue: 'INFO'
                            },
          message:          { type: Sequelize.TEXT, allowNull: false },
          target_role:      { type: Sequelize.STRING(100), defaultValue: 'admin' },
          is_read:          { type: Sequelize.BOOLEAN, defaultValue: false },
          client_id:        { type: Sequelize.INTEGER, allowNull: true },
          metadata:         { type: Sequelize.JSON, allowNull: true },
          created_at:       { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
          updated_at:       { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
        });
      } else if (!hasNewColumn) {
        // Table exists but missing audit_session_id for some other reason — add missing columns
        await queryInterface.addColumn('audit_notifications', 'audit_session_id', {
          type: Sequelize.INTEGER, allowNull: true, after: 'id'
        });
        if (!(await hasColumn('audit_notifications', 'type'))) {
          await queryInterface.addColumn('audit_notifications', 'type', {
            type: Sequelize.ENUM('CRITICAL', 'WARNING', 'REMINDER', 'INFO'),
            defaultValue: 'INFO'
          });
        }
        if (!(await hasColumn('audit_notifications', 'target_role'))) {
          await queryInterface.addColumn('audit_notifications', 'target_role', {
            type: Sequelize.STRING(100), defaultValue: 'admin'
          });
        }
        if (!(await hasColumn('audit_notifications', 'client_id'))) {
          await queryInterface.addColumn('audit_notifications', 'client_id', {
            type: Sequelize.INTEGER, allowNull: true
          });
        }
        if (!(await hasColumn('audit_notifications', 'metadata'))) {
          await queryInterface.addColumn('audit_notifications', 'metadata', {
            type: Sequelize.JSON, allowNull: true
          });
        }
      }
      // else: table already has correct schema — nothing to do
    } else {
      // Table doesn't exist at all — create fresh
      await queryInterface.createTable('audit_notifications', {
        id:               { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        audit_session_id: { type: Sequelize.INTEGER, allowNull: true },
        type:             {
                            type: Sequelize.ENUM('CRITICAL', 'WARNING', 'REMINDER', 'INFO'),
                            defaultValue: 'INFO'
                          },
        message:          { type: Sequelize.TEXT, allowNull: false },
        target_role:      { type: Sequelize.STRING(100), defaultValue: 'admin' },
        is_read:          { type: Sequelize.BOOLEAN, defaultValue: false },
        client_id:        { type: Sequelize.INTEGER, allowNull: true },
        metadata:         { type: Sequelize.JSON, allowNull: true },
        created_at:       { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at:       { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // FIX 2: globalsettings — case-sensitivity fix + missing columns
    // ────────────────────────────────────────────────────────────────────────
    //
    // On Linux MySQL (lower_case_table_names=0), 'GlobalSettings' != 'globalsettings'.
    // The model uses tableName: 'globalsettings'. If only 'GlobalSettings' exists,
    // queries fail with ER_NO_SUCH_TABLE.
    //
    const globalSettingsLower = await tableExists('globalsettings');
    const globalSettingsUpper = await tableExists('GlobalSettings');

    if (!globalSettingsLower) {
      if (globalSettingsUpper) {
        // Rename PascalCase to lowercase (MySQL RENAME TABLE is case-sensitive on Linux)
        await queryInterface.sequelize.query('RENAME TABLE `GlobalSettings` TO `globalsettings`');
      } else {
        // Neither exists — create from scratch
        await queryInterface.createTable('globalsettings', {
          id:                          { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
          company_name:                { type: Sequelize.STRING(255), allowNull: true },
          company_logo:                { type: Sequelize.STRING(500), allowNull: true },
          currency_symbol:             { type: Sequelize.STRING(5), defaultValue: '₹' },
          date_format:                 { type: Sequelize.STRING(20), defaultValue: 'DD-MM-YYYY' },
          fy_start_month:              { type: Sequelize.INTEGER, defaultValue: 4 },
          default_depreciation_method: { type: Sequelize.ENUM('SLM', 'WDV'), defaultValue: 'SLM' },
          email_notifications:         { type: Sequelize.BOOLEAN, defaultValue: true },
          amc_reminder_days:           { type: Sequelize.INTEGER, defaultValue: 30 },
          warranty_reminder_days:      { type: Sequelize.INTEGER, defaultValue: 30 },
          max_upload_size_mb:          { type: Sequelize.INTEGER, defaultValue: 10 },
          session_timeout_minutes:     { type: Sequelize.INTEGER, defaultValue: 30 },
          allow_excel_export:          { type: Sequelize.BOOLEAN, defaultValue: true },
          allow_pdf_export:            { type: Sequelize.BOOLEAN, defaultValue: true },
          enabled_features:            {
                                         type: Sequelize.JSON,
                                         defaultValue: JSON.stringify({
                                           procurement: true, finance_cwip: true,
                                           depreciation: true, audit: true, tagging_rfid: false
                                         })
                                       },
          updated_by:                  { type: Sequelize.INTEGER, allowNull: true },
          created_at:                  { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
          updated_at:                  { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
        });
      }
    }

    // Add missing columns to globalsettings if it now exists but was created by old migration
    const gsExists = await tableExists('globalsettings');
    if (gsExists) {
      if (!(await hasColumn('globalsettings', 'allow_excel_export'))) {
        await queryInterface.addColumn('globalsettings', 'allow_excel_export', {
          type: Sequelize.BOOLEAN, defaultValue: true
        });
      }
      if (!(await hasColumn('globalsettings', 'allow_pdf_export'))) {
        await queryInterface.addColumn('globalsettings', 'allow_pdf_export', {
          type: Sequelize.BOOLEAN, defaultValue: true
        });
      }
      if (!(await hasColumn('globalsettings', 'enabled_features'))) {
        await queryInterface.addColumn('globalsettings', 'enabled_features', {
          type: Sequelize.JSON,
          defaultValue: JSON.stringify({
            procurement: true, finance_cwip: true,
            depreciation: true, audit: true, tagging_rfid: false
          })
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // FIX 3: approval_matrix — add missing columns if not present
    // ────────────────────────────────────────────────────────────────────────
    const amExists = await tableExists('approval_matrix');
    if (amExists) {
      if (!(await hasColumn('approval_matrix', 'module_name'))) {
        await queryInterface.addColumn('approval_matrix', 'module_name', {
          type: Sequelize.STRING(100), allowNull: true
        });
      }
      if (!(await hasColumn('approval_matrix', 'role_code'))) {
        await queryInterface.addColumn('approval_matrix', 'role_code', {
          type: Sequelize.STRING(100), allowNull: true
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // FIX 4: notifications table — ensure it exists (Notification model)
    // ────────────────────────────────────────────────────────────────────────
    const notifExists = await tableExists('notifications');
    if (!notifExists) {
      await queryInterface.createTable('notifications', {
        id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id:    { type: Sequelize.INTEGER, allowNull: false },
        alert_id:   { type: Sequelize.INTEGER, allowNull: true },
        type:       { type: Sequelize.ENUM('EMAIL', 'SMS', 'PUSH'), allowNull: false },
        message:    { type: Sequelize.TEXT, allowNull: false },
        status:     { type: Sequelize.ENUM('PENDING', 'SENT', 'FAILED'), defaultValue: 'PENDING' },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
  },

  down: async (queryInterface) => {
    // audit_notifications: drop (will be recreated by prior migration on re-run)
    try { await queryInterface.dropTable('audit_notifications'); } catch (_) {}
    // Other changes are non-destructive additive — leave in place on rollback
  }
};
