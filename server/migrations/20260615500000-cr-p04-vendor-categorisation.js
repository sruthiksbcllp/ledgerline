'use strict';
/**
 * CR-P04 — Vendor categorisation. Adds vendors.procurement_type + a vendor_categories
 * M:N map (vendor -> asset_categories) and seeds VENDOR_CATEGORISATION (disabled). Additive + reversible.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const q = queryInterface.sequelize;
    const v = await queryInterface.describeTable('vendors');
    if (!v.procurement_type) await queryInterface.addColumn('vendors', 'procurement_type', { type: Sequelize.STRING(30), allowNull: true });
    await q.query(`
      CREATE TABLE IF NOT EXISTS \`vendor_categories\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`vendor_id\` int NOT NULL,
        \`category_id\` int NOT NULL,
        \`client_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_vendor_category\` (\`vendor_id\`,\`category_id\`),
        KEY \`ix_vc_category\` (\`category_id\`),
        CONSTRAINT \`fk_vc_vendor\` FOREIGN KEY (\`vendor_id\`) REFERENCES \`vendors\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    try {
      const [rows] = await q.query("SELECT id FROM featuretoggles WHERE feature_key='VENDOR_CATEGORISATION' LIMIT 1");
      if (!rows.length) await queryInterface.bulkInsert('featuretoggles', [{
        client_id: null, feature_key: 'VENDOR_CATEGORISATION', feature_name: 'Vendor Categorisation & Suggestion',
        module: 'PROCUREMENT', is_enabled: false, createdAt: new Date(), updatedAt: new Date()
      }]);
    } catch (e) { /* skip */ }
  },
  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query('DROP TABLE IF EXISTS `vendor_categories`;');
    const v = await queryInterface.describeTable('vendors');
    if (v.procurement_type) await queryInterface.removeColumn('vendors', 'procurement_type');
    try { await q.query("DELETE FROM featuretoggles WHERE feature_key='VENDOR_CATEGORISATION'"); } catch (e) { /* skip */ }
  }
};
