'use strict';

module.exports = {
  up: async (queryInterface) => {
    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE auditplans MODIFY COLUMN `asset_id` INT NULL, MODIFY COLUMN `auditor_id` INT NULL, MODIFY COLUMN `scheduled_date` DATETIME NULL DEFAULT NULL'
      );
    } catch (_) {}
  },
  down: async () => {}
};
