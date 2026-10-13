'use strict';

/** CFG-01 logo persistence — store the letterhead logo in the DB (survives container redeploys). */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('po_print_config');
    if (!cols.logo_data) {
      await queryInterface.addColumn('po_print_config', 'logo_data', { type: Sequelize.BLOB('long'), allowNull: true });
    }
    if (!cols.logo_mime) {
      await queryInterface.addColumn('po_print_config', 'logo_mime', { type: Sequelize.STRING(100), allowNull: true });
    }
  },
  async down(queryInterface) {
    const cols = await queryInterface.describeTable('po_print_config').catch(() => ({}));
    if (cols.logo_data) await queryInterface.removeColumn('po_print_config', 'logo_data').catch(() => {});
    if (cols.logo_mime) await queryInterface.removeColumn('po_print_config', 'logo_mime').catch(() => {});
  }
};
