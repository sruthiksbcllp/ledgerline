'use strict';
/**
 * CR-P03 — GST place of supply by property. Adds state_code + gstin to `properties`
 * and seeds GST_PLACE_OF_SUPPLY feature toggle (DISABLED). Additive + reversible.
 * Invoice cgst/sgst/igst columns already exist — no invoice schema change.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.describeTable('properties');
    if (!t.state_code) await queryInterface.addColumn('properties', 'state_code', { type: Sequelize.STRING(2), allowNull: true });
    if (!t.gstin)      await queryInterface.addColumn('properties', 'gstin', { type: Sequelize.STRING(15), allowNull: true });
    try {
      const q = queryInterface.sequelize;
      const [rows] = await q.query("SELECT id FROM featuretoggles WHERE feature_key='GST_PLACE_OF_SUPPLY' LIMIT 1");
      if (!rows.length) {
        await queryInterface.bulkInsert('featuretoggles', [{
          client_id: null, feature_key: 'GST_PLACE_OF_SUPPLY', feature_name: 'GST Place of Supply (per property)',
          module: 'PROCUREMENT', is_enabled: false, createdAt: new Date(), updatedAt: new Date()
        }]);
      }
    } catch (e) { /* toggle table shape differs — skip */ }
  },
  async down(queryInterface) {
    const t = await queryInterface.describeTable('properties');
    if (t.state_code) await queryInterface.removeColumn('properties', 'state_code');
    if (t.gstin)      await queryInterface.removeColumn('properties', 'gstin');
    try { await queryInterface.sequelize.query("DELETE FROM featuretoggles WHERE feature_key='GST_PLACE_OF_SUPPLY'"); } catch (e) { /* skip */ }
  }
};
