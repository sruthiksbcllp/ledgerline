'use strict';

module.exports = {
  up: async (queryInterface) => {
    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE auditplans MODIFY COLUMN `audit_name` VARCHAR(255) NULL DEFAULT NULL'
      );
    } catch (_) {}
  },
  down: async () => {}
};
