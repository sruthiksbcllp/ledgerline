'use strict';

/**
 * 20260504220000-fix-timestamp-columns-audit-verification.js
 *
 * verificationsessions:
 *   - has created_at/updated_at but model expects createdAt/updatedAt (no underscored)
 *   - status ENUM has wrong values — fix to OPEN/CLOSED/APPROVED/REJECTED
 *   - session_name missing NOT NULL was fine as nullable
 *
 * auditplans:
 *   - has createdAt/updatedAt but model uses underscored:true so expects created_at/updated_at
 */

module.exports = {
  up: async (queryInterface) => {
    const hasColumn = async (table, col) => {
      try {
        const desc = await queryInterface.describeTable(table);
        return Object.prototype.hasOwnProperty.call(desc, col);
      } catch (_) { return false; }
    };

    // ── verificationsessions: rename created_at -> createdAt, updated_at -> updatedAt ──
    if (await hasColumn('verificationsessions', 'created_at') && !(await hasColumn('verificationsessions', 'createdAt'))) {
      await queryInterface.sequelize.query(
        'ALTER TABLE verificationsessions CHANGE `created_at` `createdAt` DATETIME NULL'
      );
    }
    if (await hasColumn('verificationsessions', 'updated_at') && !(await hasColumn('verificationsessions', 'updatedAt'))) {
      await queryInterface.sequelize.query(
        'ALTER TABLE verificationsessions CHANGE `updated_at` `updatedAt` DATETIME NULL'
      );
    }

    // Fix status ENUM to match model: OPEN/CLOSED/APPROVED/REJECTED
    // Must temporarily allow NULL to change ENUM safely
    await queryInterface.sequelize.query(
      "ALTER TABLE verificationsessions MODIFY COLUMN `status` ENUM('OPEN','CLOSED','APPROVED','REJECTED','IN_PROGRESS','COMPLETED','CANCELLED') NULL DEFAULT 'OPEN'"
    );
    await queryInterface.sequelize.query(
      "UPDATE verificationsessions SET status = 'OPEN' WHERE status IN ('IN_PROGRESS','COMPLETED','CANCELLED') OR status IS NULL"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE verificationsessions MODIFY COLUMN `status` ENUM('OPEN','CLOSED','APPROVED','REJECTED') NOT NULL DEFAULT 'OPEN'"
    );

    // ── auditplans: rename createdAt -> created_at, updatedAt -> updated_at ──
    if (await hasColumn('auditplans', 'createdAt') && !(await hasColumn('auditplans', 'created_at'))) {
      await queryInterface.sequelize.query(
        'ALTER TABLE auditplans CHANGE `createdAt` `created_at` DATETIME NULL'
      );
    }
    if (await hasColumn('auditplans', 'updatedAt') && !(await hasColumn('auditplans', 'updated_at'))) {
      await queryInterface.sequelize.query(
        'ALTER TABLE auditplans CHANGE `updatedAt` `updated_at` DATETIME NULL'
      );
    }
  },

  down: async () => {}
};
