'use strict';

/**
 * Registration used to hard-code client_id = 1 without creating a clients row. Now that
 * sign-ups create real clients, an empty clients table would hand id 1 (and its existing
 * users and data) to the first new company. Create a placeholder client for every
 * client_id that users or vendors already reference, so new companies get fresh ids.
 */
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT DISTINCT ref.client_id AS id FROM (
        SELECT client_id FROM users WHERE client_id IS NOT NULL
        UNION SELECT client_id FROM vendors WHERE client_id IS NOT NULL
      ) ref
      LEFT JOIN clients c ON c.id = ref.client_id
      WHERE c.id IS NULL
      ORDER BY ref.client_id
    `);
    for (const { id } of rows) {
      await queryInterface.sequelize.query(
        'INSERT INTO clients (id, client_name, email_domain) VALUES (?, ?, NULL)',
        { replacements: [id, `Existing company #${id}`] }
      );
    }
  },

  async down() {
    // Placeholder clients may already own data. Leave them in place.
  }
};
