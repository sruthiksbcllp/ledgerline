'use strict';
/** CR-P06 — opt-in location dimension in document numbering (additive, reversible). */
module.exports = {
  async up(q, S) {
    const t = await q.describeTable('document_numbering_config');
    if (!t.include_location) await q.addColumn('document_numbering_config', 'include_location', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
  },
  async down(q) {
    const t = await q.describeTable('document_numbering_config');
    if (t.include_location) await q.removeColumn('document_numbering_config', 'include_location');
  }
};
