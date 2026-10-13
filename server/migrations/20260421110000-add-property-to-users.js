'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const table = await queryInterface.describeTable('users');
      if (!table['property_id']) {
        await queryInterface.addColumn('users', 'property_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'properties', key: 'id' }
        });
      }
    } catch(e) { /* skip */ }
  },

  async down(queryInterface) {
    try { await queryInterface.removeColumn('users', 'property_id'); } catch(e) { /* skip */ }
  }
};
