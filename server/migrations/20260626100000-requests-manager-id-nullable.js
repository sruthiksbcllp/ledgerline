'use strict';

/**
 * Fix: requests.manager_id was created NOT NULL but also carries an FK to users and is
 * an OPTIONAL field (the Request model treats it as nullable, the request-create flow
 * never sets it). NOT NULL + FK made it impossible to create a Request without a manager
 * (default 0 fails the FK; null fails NOT NULL). Relax to NULL to match the model.
 * Idempotent + reversible (down re-applies NOT NULL only if no null rows exist).
 */
module.exports = {
  async up(queryInterface) {
    const [cols] = await queryInterface.sequelize.query(
      "SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_NAME='requests' AND COLUMN_NAME='manager_id' AND TABLE_SCHEMA=DATABASE()"
    );
    if (cols.length && cols[0].IS_NULLABLE === 'NO') {
      await queryInterface.sequelize.query("ALTER TABLE `requests` MODIFY `manager_id` INT NULL");
    }
  },
  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS n FROM `requests` WHERE `manager_id` IS NULL"
    );
    if (Number(rows[0].n) === 0) {
      await queryInterface.sequelize.query("ALTER TABLE `requests` MODIFY `manager_id` INT NOT NULL");
    }
  }
};
