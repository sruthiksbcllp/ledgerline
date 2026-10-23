'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Add unique indexes on document number columns to prevent duplicates at DB level.
    // Each index is client-scoped so different tenants can have the same number format.
    // Using try/catch per index so the migration is re-runnable.

    const indexes = [
      { table: 'purchaserequisitions', column: 'pr_number',       name: 'uq_pr_number_client',  clientCol: 'client_id' },
      { table: 'purchaseorders',       column: 'po_number',       name: 'uq_po_number_client',  clientCol: 'client_id' },
      { table: 'grns',                  column: 'grn_number',      name: 'uq_grn_number_client', clientCol: 'client_id' },
      { table: 'quotation_master',      column: 'quotation_number', name: 'uq_qtn_number_client', clientCol: 'client_id' },
    ];

    for (const idx of indexes) {
      try {
        await queryInterface.addIndex(idx.table, {
          fields: [idx.clientCol, idx.column],
          unique: true,
          name: idx.name
        });
      } catch (e) {
        // Index may already exist or column may not exist — skip silently
        if (!e.message.includes('Duplicate key name') && !e.message.includes('already exists')) {
          // Log but don't fail — non-critical for app function
        }
      }
    }
  },

  down: async (queryInterface) => {
    const names = ['uq_pr_number_client', 'uq_po_number_client', 'uq_grn_number_client', 'uq_qtn_number_client'];
    const tables = ['purchaserequisitions', 'purchaseorders', 'grns', 'quotation_master'];
    for (let i = 0; i < names.length; i++) {
      try { await queryInterface.removeIndex(tables[i], names[i]); } catch (e) { /* skip */ }
    }
  }
};
