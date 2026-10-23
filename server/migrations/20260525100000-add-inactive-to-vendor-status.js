'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE vendors MODIFY COLUMN status ENUM('DRAFT','ACTIVE','BLACKLISTED','INACTIVE') NOT NULL DEFAULT 'DRAFT'"
    );
  },
  async down(queryInterface) {
    // Remove INACTIVE vendors before reverting ENUM
    await queryInterface.sequelize.query(
      "UPDATE vendors SET status = 'BLACKLISTED' WHERE status = 'INACTIVE'"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE vendors MODIFY COLUMN status ENUM('DRAFT','ACTIVE','BLACKLISTED') NOT NULL DEFAULT 'DRAFT'"
    );
  }
};
