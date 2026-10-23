'use strict';
// Additive: free-text owner/approver/allocation-owner NAMES on cost_centers, so roles held by
// people without FixTag logins can be recorded and edited on replacement. The existing *_id
// FKs are kept (optional) for clients that link real users (e.g. non-DOA approval routing).
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.describeTable('cost_centers');
    const add = async (col) => {
      if (!t[col]) {
        await queryInterface.addColumn('cost_centers', col, { type: Sequelize.STRING(150), allowNull: true });
      }
    };
    await add('owner_name');
    await add('approver_name');
    await add('allocation_owner_name');
  },
  async down(queryInterface) {
    const t = await queryInterface.describeTable('cost_centers');
    for (const col of ['owner_name', 'approver_name', 'allocation_owner_name']) {
      if (t[col]) await queryInterface.removeColumn('cost_centers', col);
    }
  }
};
