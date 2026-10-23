'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const sequelize = queryInterface.sequelize;

    console.log('[Migration] Backfill: Creating primary companies for existing clients...');

    // Step 1: Get all active clients
    const clients = await sequelize.query(
      `SELECT id, subdomain, client_name FROM clients`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    console.log(`[Migration] Found ${clients.length} active clients`);

    // Step 2: Create a primary company for each client that doesn't have one
    for (const client of clients) {
      const existing = await sequelize.query(
        `SELECT id FROM companies WHERE client_id = ?`,
        { replacements: [client.id], type: Sequelize.QueryTypes.SELECT }
      );

      if (existing.length === 0) {
        const companyCode = `${(client.subdomain || 'ORG' + client.id).toUpperCase()}-001`;
        const companyName = client.client_name || `Organization ${client.id}`;

        await sequelize.query(
          `INSERT INTO companies
           (client_id, company_code, company_name, is_primary, is_active, created_at, updated_at)
           VALUES (?, ?, ?, TRUE, TRUE, NOW(), NOW())`,
          { replacements: [client.id, companyCode, companyName] }
        );

        console.log(`[Migration] Created company: ${companyCode}`);
      }
    }

    console.log('[Migration] Backfill: Updating assets with company_id...');

    // Step 3: Backfill company_id in assets
    const assetsUpdated = await sequelize.query(
      `UPDATE assets a
       JOIN clients c ON a.client_id = c.id
       JOIN companies co ON c.id = co.client_id AND co.is_primary = TRUE
       SET a.company_id = co.id
       WHERE a.company_id IS NULL`
    );

    console.log(`[Migration] Updated ${assetsUpdated[1] || 0} asset records`);

    console.log('[Migration] Backfill: Updating depreciationledgers with company_id...');

    // Step 4: Backfill company_id in depreciationledgers
    const depreciationUpdated = await sequelize.query(
      `UPDATE depreciationledgers dl
       JOIN assets a ON dl.asset_id = a.id
       SET dl.company_id = a.company_id
       WHERE dl.company_id IS NULL`
    );

    console.log(`[Migration] Updated ${depreciationUpdated[1] || 0} depreciation records`);

    console.log('[Migration] Backfill: Creating user-company assignments...');

    // Step 5: Backfill user_company_assignments (all users assigned to primary company)
    const assignmentsCreated = await sequelize.query(
      `INSERT INTO user_company_assignments
       (user_id, company_id, client_id, is_primary, access_level, created_at, updated_at)
       SELECT u.id, co.id, u.client_id, TRUE, 'EDIT', NOW(), NOW()
       FROM users u
       JOIN companies co ON u.client_id = co.client_id AND co.is_primary = TRUE
       WHERE u.id NOT IN (SELECT user_id FROM user_company_assignments)
       AND u.status = 'ACTIVE'`
    );

    console.log(`[Migration] Created ${assignmentsCreated[0] || 0} user-company assignments`);

    console.log('[Migration] Backfill complete');
  },

  down: async (queryInterface, Sequelize) => {
    const sequelize = queryInterface.sequelize;

    console.log('[Rollback] Removing backfilled data...');

    // Delete user assignments created during migration
    await sequelize.query(
      `DELETE FROM user_company_assignments
       WHERE created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)`
    );

    // Delete companies created during migration (only primary ones)
    await sequelize.query(
      `DELETE FROM companies
       WHERE is_primary = TRUE AND created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)`
    );

    // Reset company_id in assets
    await sequelize.query(`UPDATE assets SET company_id = NULL`);

    // Reset company_id in depreciationledgers
    await sequelize.query(`UPDATE depreciationledgers SET company_id = NULL`);

    console.log('[Rollback] Complete');
  }
};
