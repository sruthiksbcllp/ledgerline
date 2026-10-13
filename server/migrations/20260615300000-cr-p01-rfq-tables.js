'use strict';
/**
 * CR-P01 — RFQ + Multi-Vendor Sourcing. Three additive, tenant-scoped tables.
 * Idempotent (CREATE TABLE IF NOT EXISTS) + reversible (down drops all three).
 * NO change to existing tables / approval engine / tenancy / FT-006.
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query(`
      CREATE TABLE IF NOT EXISTS \`rfqs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int NOT NULL,
        \`rfq_number\` varchar(50) DEFAULT NULL,
        \`pr_id\` int DEFAULT NULL,
        \`title\` varchar(255) DEFAULT NULL,
        \`status\` enum('DRAFT','SENT','PARTIALLY_RESPONDED','CLOSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
        \`due_date\` datetime DEFAULT NULL,
        \`remarks\` text,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_rfq_number_client\` (\`client_id\`,\`rfq_number\`),
        KEY \`ix_rfq_client\` (\`client_id\`),
        KEY \`ix_rfq_pr\` (\`pr_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS \`rfq_items\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`rfq_id\` int NOT NULL,
        \`client_id\` int DEFAULT NULL,
        \`item_name\` varchar(255) DEFAULT NULL,
        \`description\` text,
        \`quantity\` decimal(15,2) DEFAULT '0.00',
        \`unit\` varchar(50) DEFAULT NULL,
        \`category_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`ix_rfqitem_rfq\` (\`rfq_id\`),
        CONSTRAINT \`fk_rfqitem_rfq\` FOREIGN KEY (\`rfq_id\`) REFERENCES \`rfqs\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS \`rfq_vendors\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`rfq_id\` int NOT NULL,
        \`vendor_id\` int NOT NULL,
        \`client_id\` int DEFAULT NULL,
        \`invite_status\` enum('PENDING','SENT','RESPONDED','DECLINED') NOT NULL DEFAULT 'PENDING',
        \`email_sent_at\` datetime DEFAULT NULL,
        \`response_quotation_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_rfqvendor\` (\`rfq_id\`,\`vendor_id\`),
        KEY \`ix_rfqvendor_vendor\` (\`vendor_id\`),
        CONSTRAINT \`fk_rfqvendor_rfq\` FOREIGN KEY (\`rfq_id\`) REFERENCES \`rfqs\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Seed RFQ_MODULE feature toggle DISABLED by default (best-effort; featureGuard fail-opens if absent).
    try {
      const [rows] = await q.query("SELECT id FROM featuretoggles WHERE feature_key='RFQ_MODULE' LIMIT 1");
      if (!rows.length) {
        await queryInterface.bulkInsert('featuretoggles', [{
          client_id: null, feature_key: 'RFQ_MODULE', feature_name: 'RFQ / Multi-Vendor Sourcing',
          module: 'PROCUREMENT', is_enabled: false, createdAt: new Date(), updatedAt: new Date()
        }]);
      }
    } catch (e) { /* toggle table shape differs — skip */ }
  },
  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query('DROP TABLE IF EXISTS `rfq_vendors`;');
    await q.query('DROP TABLE IF EXISTS `rfq_items`;');
    await q.query('DROP TABLE IF EXISTS `rfqs`;');
    try { await q.query("DELETE FROM featuretoggles WHERE feature_key='RFQ_MODULE'"); } catch (e) { /* skip */ }
  }
};
