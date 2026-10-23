'use strict';

/**
 * Bootstrap Seed Migration
 * ========================
 * Seeds the minimum system data required for a brand-new Fixtag installation
 * to be fully operational after migrations.
 *
 * Creates:
 *   - 9 Roles (PROVIDER_ADMIN ... MAINTENANCE)
 *   - 5 Asset Statuses (Active ... Transferred)
 *   - 1 Bootstrap user: admin (PROVIDER_ADMIN, client_id=NULL)
 *   - 1 user_roles junction row
 *
 * Rules:
 *   - INSERT IGNORE everywhere - safe to run multiple times
 *   - No client-specific data
 *   - No demo data
 */

const { QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    const q = queryInterface.sequelize;

    // --- 1. Roles ---
    await q.query(`
      INSERT IGNORE INTO \`roles\` (\`code\`, \`name\`, \`description\`, \`level\`, \`created_at\`, \`updated_at\`) VALUES
        ('PROVIDER_ADMIN', 'Provider Administrator',  'Cross-tenant operator - sees all clients',      100, NOW(), NOW()),
        ('SUPER_ADMIN',    'Super Administrator',      'Per-client super user - must have client_id',    90, NOW(), NOW()),
        ('CLIENT_ADMIN',   'Client Administrator',     'Client-level admin - manages own tenant',        80, NOW(), NOW()),
        ('ADMIN',          'Administrator',            'General admin role',                             70, NOW(), NOW()),
        ('FINANCE',        'Finance',                  'Finance and accounting operations',              50, NOW(), NOW()),
        ('PROCUREMENT',    'Procurement',              'Procurement and purchasing operations',          50, NOW(), NOW()),
        ('REQUESTER',      'Requester',                'Standard user - can raise requests',             30, NOW(), NOW()),
        ('AUDITOR',        'Auditor',                  'Read-only audit role',                           40, NOW(), NOW()),
        ('MAINTENANCE',    'Maintenance',              'Maintenance and AMC operations',                 40, NOW(), NOW());
    `);

    // --- 2. Asset Statuses ---
    // CRITICAL-0 fix (REL-CR-2026-06-13): the INSERT below references asset_statuses.code,
    // but that column is added by 20260611100000 (a later-named migration). On a clean DB
    // (e.g. production) name-order runs THIS migration first, so ensure the column exists.
    // Idempotent: no-op where code already exists (dev/stage already migrated).
    try {
      const ssCols = await queryInterface.describeTable('asset_statuses');
      if (!ssCols.code) {
        await queryInterface.addColumn('asset_statuses', 'code', { type: Sequelize.STRING(30), allowNull: true, after: 'id' });
      }
    } catch (e) { /* table may not exist on a truly empty install */ }
    // code='ACTIVE' is critical - GRN and asset.service resolve via statusResolver
    await q.query(`
      INSERT IGNORE INTO \`asset_statuses\` (\`id\`, \`code\`, \`status_name\`, \`status_color\`, \`description\`, \`display_order\`, \`createdAt\`, \`updatedAt\`) VALUES
        (1, 'ACTIVE',            'Active',            '#10b981', 'Asset is in active use',                  1, NOW(), NOW()),
        (2, 'INACTIVE',          'Inactive',          '#6b7280', 'Asset is not currently in use',            2, NOW(), NOW()),
        (3, 'DISPOSED',          'Disposed',          '#ef4444', 'Asset has been disposed or scrapped',      3, NOW(), NOW()),
        (4, 'UNDER_MAINTENANCE', 'Under Maintenance', '#f59e0b', 'Asset is undergoing maintenance or repair',4, NOW(), NOW()),
        (5, 'TRANSFERRED',       'Transferred',       '#3b82f6', 'Asset has been transferred to another location or entity', 5, NOW(), NOW());
    `);

    // --- 3. Bootstrap Provider User ---
    // Password: Fixtag@2026 (bcrypt 10 rounds)
    // client_id = NULL (PROVIDER_ADMIN sees all tenants)
    const providerRole = await q.query(
      `SELECT id FROM \`roles\` WHERE \`code\` = 'PROVIDER_ADMIN' LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    const roleId = providerRole[0]?.id;
    if (!roleId) {
      throw new Error('Bootstrap seed: PROVIDER_ADMIN role not found after insert - cannot continue');
    }

    await q.query(`
      INSERT IGNORE INTO \`users\`
        (\`first_name\`, \`last_name\`, \`email\`, \`employee_id\`, \`username\`, \`password_hash\`,
         \`role_id\`, \`client_id\`, \`user_level\`, \`status\`)
      VALUES
        ('Platform', 'Admin', 'admin@example.com', 'ADM-001', 'admin',
         '$2b$10$BD06tHCswF4.Ag9UX3dZAO7pFrM3YmJhabe26V1YiN2nzXt7ByJm.',
         ${roleId}, NULL, 'Level 1', 'ACTIVE');
    `);

    // --- 4. user_roles junction ---
    const bootstrapUser = await q.query(
      `SELECT id FROM \`users\` WHERE \`username\` = 'admin' LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    const userId = bootstrapUser[0]?.id;
    if (userId) {
      await q.query(`
        INSERT IGNORE INTO \`user_roles\` (\`user_id\`, \`role_id\`)
        VALUES (${userId}, ${roleId});
      `);
    }
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    // Reverse in dependency order
    await q.query(`DELETE FROM \`user_roles\` WHERE \`user_id\` IN (SELECT id FROM \`users\` WHERE \`username\` = 'admin')`);
    await q.query(`DELETE FROM \`users\` WHERE \`username\` = 'admin'`);
    await q.query(`DELETE FROM \`asset_statuses\` WHERE \`id\` IN (1,2,3,4,5)`);
    await q.query(`DELETE FROM \`roles\` WHERE \`code\` IN ('PROVIDER_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN','FINANCE','PROCUREMENT','REQUESTER','AUDITOR','MAINTENANCE')`);
  }
};
