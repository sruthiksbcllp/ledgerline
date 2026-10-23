'use strict';
/**
 * Widen notificationlogs.entity_type ENUM to include the values the notification scheduler actually
 * writes: AMC, APPROVAL_REMINDER, APPROVAL_ESCALATION. The original ENUM('MAINTENANCE','INSURANCE',
 * 'WARRANTY') truncated those to '' (or threw in strict mode), corrupting/losing the notification
 * audit-log row (email still sent — try/catch marked non-fatal). Additive, drift-safe, idempotent,
 * reversible. Audit-log table + ENUM change -> mandatory snapshot-restore dry-run before stage/prod.
 */
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM `notificationlogs` LIKE 'entity_type'"
    );
    const type = rows && rows[0] ? String(rows[0].Type) : '';
    if (!type) return; // table/column not present — nothing to do
    if (!type.includes('APPROVAL_ESCALATION')) {
      await queryInterface.sequelize.query(
        "ALTER TABLE `notificationlogs` MODIFY COLUMN `entity_type` " +
        "ENUM('MAINTENANCE','INSURANCE','WARRANTY','AMC','APPROVAL_REMINDER','APPROVAL_ESCALATION') NOT NULL"
      );
    }
  },
  async down(queryInterface) {
    // Best-effort narrow back to the original 3 (rows carrying the new values would be truncated,
    // so this is guarded; the widened ENUM is harmless if left in place).
    await queryInterface.sequelize.query(
      "ALTER TABLE `notificationlogs` MODIFY COLUMN `entity_type` " +
      "ENUM('MAINTENANCE','INSURANCE','WARRANTY') NOT NULL"
    ).catch(() => {});
  }
};
