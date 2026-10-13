'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('invoices');

    if (!table.payment_blocked) {
      await queryInterface.addColumn('invoices', 'payment_blocked', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
    if (!table.payment_block_reason) {
      await queryInterface.addColumn('invoices', 'payment_block_reason', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
    if (!table.exception_status) {
      await queryInterface.addColumn('invoices', 'exception_status', {
        type: Sequelize.ENUM('NONE', 'OPEN', 'MANUAL_APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'NONE'
      });
    }
    if (!table.exception_resolved_by) {
      await queryInterface.addColumn('invoices', 'exception_resolved_by', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
    if (!table.exception_resolved_at) {
      await queryInterface.addColumn('invoices', 'exception_resolved_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
    if (!table.matching_tolerance_percent) {
      await queryInterface.addColumn('invoices', 'matching_tolerance_percent', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 5
      });
    }
    if (!table.matching_details_json) {
      await queryInterface.addColumn('invoices', 'matching_details_json', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('invoices');
    if (table.matching_details_json) await queryInterface.removeColumn('invoices', 'matching_details_json');
    if (table.matching_tolerance_percent) await queryInterface.removeColumn('invoices', 'matching_tolerance_percent');
    if (table.exception_resolved_at) await queryInterface.removeColumn('invoices', 'exception_resolved_at');
    if (table.exception_resolved_by) await queryInterface.removeColumn('invoices', 'exception_resolved_by');
    if (table.exception_status) await queryInterface.removeColumn('invoices', 'exception_status');
    if (table.payment_block_reason) await queryInterface.removeColumn('invoices', 'payment_block_reason');
    if (table.payment_blocked) await queryInterface.removeColumn('invoices', 'payment_blocked');
  }
};
