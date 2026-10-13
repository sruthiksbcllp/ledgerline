'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const addColIfMissing = async (table, col, def) => {
      try {
        const cols = await queryInterface.describeTable(table);
        if (!cols[col]) {
          await queryInterface.addColumn(table, col, def);
          console.log(`  + ${table}.${col}`);
        } else {
          console.log(`  = ${table}.${col} already exists`);
        }
      } catch (e) {
        console.log(`  ! ${table}.${col} skipped: ${e.message}`);
      }
    };

    const approvalFields = [
      ['workflow_id',           { type: Sequelize.INTEGER, allowNull: true }],
      ['current_level',         { type: Sequelize.INTEGER, defaultValue: 0 }],
      ['current_approval_level',{ type: Sequelize.INTEGER, defaultValue: 0 }],
      ['total_approval_levels', { type: Sequelize.INTEGER, defaultValue: 0 }],
      ['status_lock',           { type: Sequelize.BOOLEAN, defaultValue: false }],
      ['is_fully_approved',     { type: Sequelize.BOOLEAN, defaultValue: false }],
      ['approval_date',         { type: Sequelize.DATE,    allowNull: true }],
    ];

    for (const [col, def] of approvalFields) {
      await addColIfMissing('purchaserequisitions', col, def);
      await addColIfMissing('purchaseorders', col, def);
    }

    // Extend status ENUM for purchaserequisitions
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE purchaserequisitions
        MODIFY COLUMN status ENUM(
          'DRAFT','SUBMITTED','PENDING_APPROVAL','IN_APPROVAL',
          'APPROVED','REJECTED','CANCELLED','PO_CREATED'
        ) NOT NULL DEFAULT 'DRAFT'
      `);
      console.log('  + purchaserequisitions.status ENUM extended');
    } catch (e) {
      console.log('  ! purchaserequisitions.status ENUM skipped:', e.message);
    }

    // Extend status ENUM for purchaseorders
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE purchaseorders
        MODIFY COLUMN status ENUM(
          'DRAFT','SUBMITTED','PENDING_APPROVAL','IN_APPROVAL',
          'ISSUED','PARTIAL_RECEIVED','RECEIVED','CLOSED',
          'CANCELLED','APPROVED','REJECTED'
        ) NOT NULL DEFAULT 'DRAFT'
      `);
      console.log('  + purchaseorders.status ENUM extended');
    } catch (e) {
      console.log('  ! purchaseorders.status ENUM skipped:', e.message);
    }
  },

  async down(queryInterface, Sequelize) {
    // Safe no-op: don't remove columns in rollback to avoid data loss
  }
};
