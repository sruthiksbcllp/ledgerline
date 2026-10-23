'use strict';

/**
 * Numbering: Entity + Department dynamic dimensions (the client CR, 2026-10-08)
 * Adds, all additive / nullable / idempotent / reversible:
 *   - entities.short_code            (STRING 10)  — 2-5 letter prefix per buying entity (e.g. NIM, NAAM)
 *   - departments.numbering_code     (STRING 10)  — short code used in doc numbers (e.g. IT, ADM)
 *   - document_numbering_config.include_entity     (BOOL default false) — dynamic entity segment
 *   - document_numbering_config.include_department (BOOL default false) — dynamic department segment
 * No backfill, no FK, no change to existing numbering behaviour until a tenant turns the flags on.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addCol = async (table, col, spec) => {
      const desc = await queryInterface.describeTable(table);
      if (!desc[col]) await queryInterface.addColumn(table, col, spec);
    };
    await addCol('entities', 'short_code', { type: Sequelize.STRING(10), allowNull: true });
    await addCol('departments', 'numbering_code', { type: Sequelize.STRING(10), allowNull: true });
    await addCol('document_numbering_config', 'include_entity', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
    });
    await addCol('document_numbering_config', 'include_department', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
    });
  },

  async down(queryInterface) {
    const dropCol = async (table, col) => {
      const desc = await queryInterface.describeTable(table);
      if (desc[col]) await queryInterface.removeColumn(table, col);
    };
    await dropCol('document_numbering_config', 'include_department');
    await dropCol('document_numbering_config', 'include_entity');
    await dropCol('departments', 'numbering_code');
    await dropCol('entities', 'short_code');
  },
};
