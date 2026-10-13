'use strict';
/**
 * DOA Phase 3b — widen doa_slab_approvers.spec_type to support:
 *   - 'MANUAL'                  : approver chosen by the initiator at PO submit
 *   - 'DYNAMIC_FACILITATOR_HEAD': (latent 3a gap — the config UI offered it but the ENUM
 *                                  lacked the value; adding it here so it can be saved)
 * Drift-safe: reads the live ENUM and only widens if a value is missing. Idempotent.
 * ENUM widening is additive — existing rows unaffected. down() best-effort narrows
 * (left widened if any row uses the new values, to avoid data loss).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    let col;
    try {
      const [rows] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM `doa_slab_approvers` LIKE 'spec_type'"
      );
      col = rows && rows[0] ? String(rows[0].Type || '') : '';
    } catch (e) { return; } // table absent (DOA-0 not applied) -> nothing to do
    const need = ['MANUAL', 'DYNAMIC_FACILITATOR_HEAD'];
    const missing = need.filter((v) => !col.includes(`'${v}'`));
    if (missing.length === 0) return;
    // full target set (existing 4 + the two additions), preserving order
    const target = ['NAMED', 'ROLE', 'DYNAMIC_INITIATOR_HEAD', 'DYNAMIC_FACILITATOR_HEAD', 'ANY_ONE_OF_GROUP', 'MANUAL'];
    const enumList = target.map((v) => `'${v}'`).join(',');
    await queryInterface.sequelize.query(
      `ALTER TABLE \`doa_slab_approvers\` MODIFY \`spec_type\` ENUM(${enumList}) NOT NULL`
    );
  },
  async down(queryInterface) {
    try {
      const [rows] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) AS c FROM `doa_slab_approvers` WHERE spec_type IN ('MANUAL','DYNAMIC_FACILITATOR_HEAD')"
      );
      if (rows && rows[0] && Number(rows[0].c) > 0) return; // rows use new values -> keep widened
      await queryInterface.sequelize.query(
        "ALTER TABLE `doa_slab_approvers` MODIFY `spec_type` ENUM('NAMED','ROLE','DYNAMIC_INITIATOR_HEAD','ANY_ONE_OF_GROUP') NOT NULL"
      );
    } catch (e) { /* ignore */ }
  },
};
