'use strict';

/**
 * asset_code_config.prefix was created as VARCHAR(20) in the baseline schema, but the model
 * declares STRING(50) and asset-code TEMPLATES routinely exceed 20 chars
 * (e.g. "{CATEGORY}/{LOCATION}" = 21, "{PROPERTY}/{CATEGORY}/{LOCATION}" = 31).
 * MySQL (non-strict) silently truncated the saved pattern to 20 chars, dropping the trailing
 * "}" so tokens like {LOCATION} became "{LOCATION" and no longer matched the render regex.
 * Widen to VARCHAR(100). Additive, non-destructive, idempotent.
 */
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM `asset_code_config` LIKE 'prefix'"
    );
    const type = rows && rows[0] ? String(rows[0].Type || '').toLowerCase() : '';
    if (!type) return; // table/column not present — nothing to do
    if (!type.includes('varchar(100')) {
      await queryInterface.sequelize.query(
        'ALTER TABLE `asset_code_config` MODIFY `prefix` VARCHAR(100) DEFAULT NULL'
      );
    }
  },

  async down(queryInterface) {
    // Narrow back only to the model's prior width (50), never to 20 (which caused the bug).
    await queryInterface.sequelize.query(
      'ALTER TABLE `asset_code_config` MODIFY `prefix` VARCHAR(50) DEFAULT NULL'
    ).catch(() => {});
  }
};
