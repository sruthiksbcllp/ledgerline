'use strict';

/**
 * Seed id_sequences table from MAX(extracted sequence number) for each document type.
 * This ensures getNextNumber() continues from the highest existing number, not COUNT(*).
 * Uses ON DUPLICATE KEY UPDATE ... GREATEST() to never decrease an existing counter.
 *
 * Pattern: extract the last numeric segment after the final separator (usually '-').
 * For "PR-C1-2026-0042", SUBSTRING_INDEX(pr_number, '-', -1) = "0042", CAST = 42.
 */
module.exports = {
  up: async (queryInterface) => {
    const seeds = [
      {
        docType: 'PR',
        sql: `
          INSERT INTO idsequences (\`prefix\`, \`last_value\`, \`createdAt\`, \`updatedAt\`)
          SELECT
            CONCAT(client_id, ':PR:', YEAR(created_at)) AS \`prefix\`,
            MAX(CAST(SUBSTRING_INDEX(pr_number, '-', -1) AS UNSIGNED)) AS \`last_value\`,
            NOW(), NOW()
          FROM purchaserequisitions
          WHERE pr_number IS NOT NULL AND pr_number != ''
          GROUP BY client_id, YEAR(created_at)
          ON DUPLICATE KEY UPDATE
            \`last_value\` = GREATEST(idsequences.\`last_value\`, VALUES(\`last_value\`))
        `
      },
      {
        docType: 'PO',
        sql: `
          INSERT INTO idsequences (\`prefix\`, \`last_value\`, \`createdAt\`, \`updatedAt\`)
          SELECT
            CONCAT(client_id, ':PO:', YEAR(created_at)) AS \`prefix\`,
            MAX(CAST(SUBSTRING_INDEX(po_number, '-', -1) AS UNSIGNED)) AS \`last_value\`,
            NOW(), NOW()
          FROM purchaseorders
          WHERE po_number IS NOT NULL AND po_number != ''
          GROUP BY client_id, YEAR(created_at)
          ON DUPLICATE KEY UPDATE
            \`last_value\` = GREATEST(idsequences.\`last_value\`, VALUES(\`last_value\`))
        `
      },
      {
        docType: 'GRN',
        sql: `
          INSERT INTO idsequences (\`prefix\`, \`last_value\`, \`createdAt\`, \`updatedAt\`)
          SELECT
            CONCAT(client_id, ':GRN:', YEAR(created_at)) AS \`prefix\`,
            MAX(CAST(SUBSTRING_INDEX(grn_number, '-', -1) AS UNSIGNED)) AS \`last_value\`,
            NOW(), NOW()
          FROM grns
          WHERE grn_number IS NOT NULL AND grn_number != ''
          GROUP BY client_id, YEAR(created_at)
          ON DUPLICATE KEY UPDATE
            \`last_value\` = GREATEST(idsequences.\`last_value\`, VALUES(\`last_value\`))
        `
      },
      {
        docType: 'QUOTATION',
        sql: `
          INSERT INTO idsequences (\`prefix\`, \`last_value\`, \`createdAt\`, \`updatedAt\`)
          SELECT
            CONCAT(COALESCE(pr.client_id, 0), ':QUOTATION:', YEAR(q.created_at)) AS \`prefix\`,
            MAX(CAST(SUBSTRING_INDEX(q.quotation_number, '-', -1) AS UNSIGNED)) AS \`last_value\`,
            NOW(), NOW()
          FROM quotation_master q
          LEFT JOIN purchaserequisitions pr ON q.pr_id = pr.id
          WHERE q.quotation_number IS NOT NULL AND q.quotation_number != ''
          GROUP BY COALESCE(pr.client_id, 0), YEAR(q.created_at)
          ON DUPLICATE KEY UPDATE
            \`last_value\` = GREATEST(idsequences.\`last_value\`, VALUES(\`last_value\`))
        `
      }
    ];

    for (const seed of seeds) {
      try {
        await queryInterface.sequelize.query(seed.sql);
      } catch (e) {
        // Table may not exist yet or be empty — non-fatal
      }
    }
  },

  down: async (queryInterface) => {
    // Remove seeded rows (only those matching our key pattern)
    try {
      await queryInterface.sequelize.query(
        "DELETE FROM idsequences WHERE prefix LIKE '%:PR:%' OR prefix LIKE '%:PO:%' OR prefix LIKE '%:GRN:%' OR prefix LIKE '%:QUOTATION:%'"
      );
    } catch (e) { /* skip */ }
  }
};
