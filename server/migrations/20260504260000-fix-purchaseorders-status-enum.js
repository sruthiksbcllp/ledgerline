'use strict';

/**
 * 20260504260000-fix-purchaseorders-status-enum.js
 * Adds RECEIVED to the purchaseorders status ENUM.
 */

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      "ALTER TABLE purchaseorders MODIFY COLUMN `status` ENUM('DRAFT','ISSUED','RECEIVED','PARTIAL_RECEIVED','CLOSED','CANCELLED') NULL DEFAULT 'DRAFT'"
    );
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      "ALTER TABLE purchaseorders MODIFY COLUMN `status` ENUM('DRAFT','ISSUED','PARTIAL_RECEIVED','CLOSED','CANCELLED') NULL DEFAULT 'DRAFT'"
    );
  }
};
