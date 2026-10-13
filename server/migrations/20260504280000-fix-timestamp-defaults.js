'use strict';

/**
 * 20260504280000-fix-timestamp-defaults.js
 *
 * Sets CURRENT_TIMESTAMP as default for created_at/updated_at columns
 * that are NOT NULL with no default, causing seed inserts to fail.
 */

module.exports = {
  up: async (queryInterface) => {
    const fixTimestamps = async (table) => {
      try {
        const desc = await queryInterface.describeTable(table);
        if (desc['created_at'] && !desc['created_at'].defaultValue) {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${table}\` MODIFY COLUMN \`created_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP`
          );
        }
        if (desc['updated_at'] && !desc['updated_at'].defaultValue) {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${table}\` MODIFY COLUMN \`updated_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
          );
        }
        if (desc['createdAt'] && !desc['createdAt'].defaultValue) {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${table}\` MODIFY COLUMN \`createdAt\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP`
          );
        }
        if (desc['updatedAt'] && !desc['updatedAt'].defaultValue) {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${table}\` MODIFY COLUMN \`updatedAt\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
          );
        }
      } catch (_) {}
    };

    const tables = [
      'gate_entries', 'gate_entry_items', 'vendor_debit_notes',
      'assetissues', 'assetmaintenances', 'assetamcs', 'assetmovements',
      'leaseschedules', 'leasejournalentries', 'leaseagreements',
      'audit_tasks', 'audit_sessions', 'auditplans', 'audit_plannings',
      'verificationsessions', 'verificationdetails',
      'serviceproviders', 'maintenancetypes',
      'provider_users', 'provider_asset_assignments', 'service_tickets',
      'requestitems', 'scan_logs', 'scanners',
      'apikeys', 'asset_types',
      'stocktransactions', 'vendor_change_requests', 'vendor_documents', 'vendor_risk_history',
      'unknown_tag_logs', 'movement_rules', 'direct_procurements', 'financialperiods',
      'audit_ai_insights', 'audit_evidence', 'audit_risk_scores',
      'purchase_requisition_items', 'approval_logs',
    ];

    for (const table of tables) {
      await fixTimestamps(table);
    }
  },

  down: async () => {}
};
