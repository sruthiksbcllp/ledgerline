'use strict';

/**
 * Adds clients.email_domain so self-registered users with the same company email
 * domain join the same tenant (client_id). Existing clients are backfilled from
 * their contact email when the domain is a company domain and not already claimed.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { emailDomain, isPublicEmailDomain } = require('../utils/companyDomain');
    const table = await queryInterface.describeTable('clients');
    if (!table.email_domain) {
      await queryInterface.addColumn('clients', 'email_domain', { type: Sequelize.STRING(255), allowNull: true });
    }
    const indexes = await queryInterface.showIndex('clients');
    if (!indexes.some((idx) => idx.name === 'clients_email_domain_unique')) {
      await queryInterface.addIndex('clients', ['email_domain'], { unique: true, name: 'clients_email_domain_unique' });
    }

    const [clients] = await queryInterface.sequelize.query(
      'SELECT id, email FROM clients WHERE email_domain IS NULL AND email IS NOT NULL ORDER BY id'
    );
    const [claimedRows] = await queryInterface.sequelize.query(
      'SELECT email_domain FROM clients WHERE email_domain IS NOT NULL'
    );
    const claimed = new Set(claimedRows.map((row) => row.email_domain));
    for (const client of clients) {
      const domain = emailDomain(client.email);
      if (!domain || isPublicEmailDomain(domain) || claimed.has(domain)) continue;
      claimed.add(domain);
      await queryInterface.sequelize.query('UPDATE clients SET email_domain = ? WHERE id = ?', {
        replacements: [domain, client.id]
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('clients');
    if (indexes.some((idx) => idx.name === 'clients_email_domain_unique')) {
      await queryInterface.removeIndex('clients', 'clients_email_domain_unique');
    }
    const table = await queryInterface.describeTable('clients');
    if (table.email_domain) await queryInterface.removeColumn('clients', 'email_domain');
  }
};
