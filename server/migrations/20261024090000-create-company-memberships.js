'use strict';

/**
 * Which companies (clients) each user may work in, and with which role.
 *
 * A user can belong to several companies; after login they pick one and their session is bound to
 * it. ACTIVE = can enter, PENDING = asked to join (via their company email domain) and waits for a
 * Company Admin, REJECTED / REVOKED = no access. Existing users are backfilled as ACTIVE members of
 * their current company with their current role, so nobody loses access.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => String(t.tableName || t).toLowerCase());
    if (!tables.includes('company_memberships')) {
      await queryInterface.createTable('company_memberships', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER, allowNull: false },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        role_code: { type: Sequelize.STRING(50), allowNull: false },
        status: { type: Sequelize.ENUM('ACTIVE', 'PENDING', 'REJECTED', 'REVOKED'), allowNull: false, defaultValue: 'ACTIVE' },
        requested_role: { type: Sequelize.STRING(50), allowNull: true },
        request_note: { type: Sequelize.STRING(500), allowNull: true },
        decided_by: { type: Sequelize.INTEGER, allowNull: true },
        decided_at: { type: Sequelize.DATE, allowNull: true },
        decision_note: { type: Sequelize.STRING(500), allowNull: true },
        last_used_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('company_memberships', ['user_id', 'client_id'], { unique: true, name: 'company_memberships_user_client' });
      await queryInterface.addIndex('company_memberships', ['client_id', 'status'], { name: 'company_memberships_client_status' });
    }

    // Backfill: every user with a company becomes an ACTIVE member of it with their current role.
    await queryInterface.sequelize.query(`
      INSERT INTO company_memberships (user_id, client_id, role_code, status, created_at, updated_at)
      SELECT u.id, u.client_id, COALESCE(r.code, 'REQUESTER'), 'ACTIVE', NOW(), NOW()
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN company_memberships m ON m.user_id = u.id AND m.client_id = u.client_id
      WHERE u.client_id IS NOT NULL AND m.id IS NULL
    `);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('company_memberships');
  }
};
