'use strict';

/**
 * 20260504110000-fix-grns-table-columns.js
 *
 * The original GRNs table (20260420233359) was created without several columns
 * that the GRN model and controller now require:
 *   - client_id   (tenant scoping — causes "Unknown column" 500 on every GRN query)
 *   - vendor_id   (used by createGRN and getApprovedPOs join)
 *   - gate_entry_id (model association)
 *   - invoice_number (set during createGRN)
 *   - status ENUM missing SUBMITTED, PARTIAL, COMPLETED values
 *
 * Also: original table was named 'grns' (PascalCase). With lower_case_table_names=1
 * in docker-compose MySQL this is fine, but model uses tableName: 'grns' — safe.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const hasColumn = async (table, column) => {
      try {
        const desc = await queryInterface.describeTable(table);
        return Object.prototype.hasOwnProperty.call(desc, column);
      } catch (_) {
        return false;
      }
    };

    // client_id — primary fix, causes "Unknown column" 500 on all GRN queries
    if (!(await hasColumn('grns', 'client_id'))) {
      await queryInterface.addColumn('grns', 'client_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
      });
    }

    // vendor_id
    if (!(await hasColumn('grns', 'vendor_id'))) {
      await queryInterface.addColumn('grns', 'vendor_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    // gate_entry_id
    if (!(await hasColumn('grns', 'gate_entry_id'))) {
      await queryInterface.addColumn('grns', 'gate_entry_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    // invoice_number
    if (!(await hasColumn('grns', 'invoice_number'))) {
      await queryInterface.addColumn('grns', 'invoice_number', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }

    // status — original ENUM only had RECEIVED, REJECTED
    // Change to full set: RECEIVED, SUBMITTED, PARTIAL, COMPLETED, REJECTED
    // MySQL ALTER COLUMN ENUM is safe when only adding values
    await queryInterface.sequelize.query(`
      ALTER TABLE grns
      MODIFY COLUMN status ENUM('RECEIVED','SUBMITTED','PARTIAL','COMPLETED','REJECTED')
      NOT NULL DEFAULT 'RECEIVED'
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Revert status ENUM (removing values — only safe if no rows use new values)
    await queryInterface.sequelize.query(`
      ALTER TABLE grns
      MODIFY COLUMN status ENUM('RECEIVED','REJECTED')
      NOT NULL DEFAULT 'RECEIVED'
    `);
    // Leave added columns in place to avoid data loss on rollback
  }
};
