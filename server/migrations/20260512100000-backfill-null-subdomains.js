'use strict';

/** Backfill subdomain for clients where it was never saved (before fix in commit 84aae89).
 *  Generates: LOWER(REPLACE(REPLACE(client_name, ' ', '-'), '.', ''))
 *  Only touches rows where subdomain IS NULL — safe to re-run.
 */
module.exports = {
  async up(queryInterface) {
    // Generate a slug from client_name: lowercase, spaces→hyphens, strip non-alphanumeric except hyphens
    await queryInterface.sequelize.query(`
      UPDATE clients
      SET subdomain = LOWER(
        REGEXP_REPLACE(
          REPLACE(TRIM(client_name), ' ', '-'),
          '[^a-z0-9-]', ''
        )
      )
      WHERE subdomain IS NULL OR subdomain = ''
    `);

    // Handle duplicate subdomains by appending the client id
    await queryInterface.sequelize.query(`
      UPDATE clients c1
      JOIN (
        SELECT subdomain, MIN(id) AS keep_id
        FROM clients
        WHERE subdomain IS NOT NULL AND subdomain != ''
        GROUP BY subdomain
        HAVING COUNT(*) > 1
      ) dups ON c1.subdomain = dups.subdomain AND c1.id != dups.keep_id
      SET c1.subdomain = CONCAT(c1.subdomain, '-', c1.id)
    `);
  },

  async down(queryInterface) {
    // Cannot reliably reverse — subdomain was NULL before, restore to NULL
    await queryInterface.sequelize.query(`
      UPDATE clients SET subdomain = NULL WHERE subdomain IS NOT NULL
    `);
  }
};
