'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const addIfMissing = async (table, col, def) => {
      try {
        const desc = await queryInterface.describeTable(table);
        if (!desc[col]) await queryInterface.addColumn(table, col, def);
      } catch (_) {}
    };

    // audit_evidence — underscored:true — missing remarks, created_at, updated_at
    await addIfMissing('audit_evidence', 'remarks',    { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('audit_evidence', 'created_at', { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('audit_evidence', 'updated_at', { type: Sequelize.DATE, allowNull: true });

    // scan_logs — timestamps:false, underscored:true — missing created_at
    await addIfMissing('scan_logs', 'created_at', { type: Sequelize.DATE, allowNull: true });
  },

  down: async () => {}
};
