'use strict';
/**
 * RBAC-01 — seed baseline permissions for the functional roles into the bootstrap set
 * so a fresh install/tenant has working roles WITHOUT anyone running the manual
 * scripts/seed-role-permissions.js. Mirrors that script's MATRIX exactly.
 *
 * Privileged roles (PROVIDER_ADMIN/SUPER_ADMIN/CLIENT_ADMIN/ADMIN) bypass checkPermission,
 * so they need NO grants — only the 5 functional roles are seeded.
 *
 * Idempotent + NON-DESTRUCTIVE: each grant is an existence-guarded INSERT
 * (INSERT ... SELECT ... WHERE NOT EXISTS), so it never duplicates and never overrides
 * an existing (possibly admin-customised) row. No unique index required.
 * Roles are GLOBAL (no client_id) -> this is a one-time platform baseline, not per-tenant.
 */

// flags: v=view a=add e=edit d=delete  (matches seed-role-permissions.js)
const MATRIX = {
  PROCUREMENT: { PR: 'vaed', ASSET: 'vae', INVENTORY: 'vae', FINANCE: 'v', MASTER: 'vae' },
  REQUESTER:   { PR: 'va',   ASSET: 'v',   MASTER: 'v' },
  FINANCE:     { FINANCE: 'vaed', PR: 'vae', ASSET: 'v', INVENTORY: 'v', CWIP: 'vae' },
  AUDITOR:     { AUDIT: 'vae', ASSET: 'v', PR: 'v' },
  MAINTENANCE: { ASSET: 'vae', PR: 'v' },
};
const bit = (s, c) => (s.includes(c) ? 1 : 0);

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    for (const [roleCode, sections] of Object.entries(MATRIX)) {
      const [rows] = await q.query('SELECT id FROM roles WHERE code = :code LIMIT 1', { replacements: { code: roleCode } });
      if (!rows || !rows.length) continue; // role absent on this install -> skip (bootstrap seeds them; be safe)
      const roleId = rows[0].id;
      for (const [section, flags] of Object.entries(sections)) {
        await q.query(
          'INSERT INTO rolepermissions (role_id, section, can_view, can_add, can_edit, can_delete) ' +
          'SELECT :rid, :sec, :v, :a, :e, :d FROM DUAL ' +
          'WHERE NOT EXISTS (SELECT 1 FROM rolepermissions WHERE role_id = :rid AND section = :sec)',
          { replacements: { rid: roleId, sec: section, v: bit(flags, 'v'), a: bit(flags, 'a'), e: bit(flags, 'e'), d: bit(flags, 'd') } }
        );
      }
    }
  },

  async down() {
    // No-op: permission (seed) data is not auto-removed on rollback — removing it could
    // delete admin customisations made through the Role & Permissions UI. Revert via git
    // if the code path is rolled back; the baseline rows are harmless if left in place.
  },
};
