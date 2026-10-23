'use strict';
/** CR-N08a: idempotency key for GL journal events. Additive + reversible.
 *  Nullable column => existing rows NULL; UNIQUE index allows multiple NULLs (InnoDB),
 *  so non-GL queue traffic (POST_PO/SYNC_ASSET/etc.) is unaffected. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('integration_queues');
    if (!table.dedupe_key) {
      await queryInterface.addColumn('integration_queues', 'dedupe_key', {
        type: Sequelize.STRING(190), allowNull: true,
      });
    }
    const idx = await queryInterface.showIndex('integration_queues');
    if (!idx.some(i => i.name === 'uk_intq_dedupe')) {
      await queryInterface.addIndex('integration_queues', ['dedupe_key'], {
        unique: true, name: 'uk_intq_dedupe',
      });
    }
  },
  async down(queryInterface) {
    const idx = await queryInterface.showIndex('integration_queues');
    if (idx.some(i => i.name === 'uk_intq_dedupe')) {
      await queryInterface.removeIndex('integration_queues', 'uk_intq_dedupe');
    }
    const table = await queryInterface.describeTable('integration_queues');
    if (table.dedupe_key) await queryInterface.removeColumn('integration_queues', 'dedupe_key');
  },
};
