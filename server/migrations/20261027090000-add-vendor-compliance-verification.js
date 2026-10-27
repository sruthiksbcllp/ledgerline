'use strict';

/**
 * Compliance verification of the details a vendor submitted (GSTIN, PAN, bank, contact).
 * A vendor stays PENDING until the Compliance Team approves (VERIFIED) or rejects (REJECTED) it
 * from Vendor Master; changing those details later puts it back to PENDING.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('vendors');
    const add = async (name, spec) => {
      if (!columns[name]) await queryInterface.addColumn('vendors', name, spec);
    };
    await add('verification_status', {
      type: Sequelize.ENUM('PENDING', 'VERIFIED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING'
    });
    await add('verified_by', { type: Sequelize.INTEGER, allowNull: true });
    await add('verified_at', { type: Sequelize.DATE, allowNull: true });
    await add('verification_remarks', { type: Sequelize.STRING(500), allowNull: true });
  },

  async down(queryInterface) {
    for (const name of ['verification_remarks', 'verified_at', 'verified_by', 'verification_status']) {
      await queryInterface.removeColumn('vendors', name);
    }
  }
};
