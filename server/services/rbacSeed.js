'use strict';

const { ROLES, PERMISSIONS } = require('../config/rbac');

const flagRow = (flags) => ({
  can_view: Boolean(flags.view),
  can_add: Boolean(flags.add),
  can_edit: Boolean(flags.edit),
  can_delete: Boolean(flags.delete)
});

/**
 * Insert the LedgerLine roles and their section permissions when missing.
 * Existing role rows are left in place. Safe to run on every startup.
 */
async function ensureLedgerRoles(sequelize) {
  const { Role, RolePermission } = require('../models');
  const query = sequelize.getQueryInterface();
  try {
    const userColumns = await query.describeTable('users');
    if (!userColumns.vendor_id) {
      await sequelize.query('ALTER TABLE users ADD COLUMN vendor_id INT NULL');
    }
    await sequelize.query("ALTER TABLE users MODIFY COLUMN status ENUM('ACTIVE','INACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'");
  } catch (err) {
    console.error('[RBAC] user account columns skipped:', err.message);
  }

  try {
    const featureColumns = await query.describeTable('featuretoggles');
    if (!featureColumns.feature_name) {
      await sequelize.query('ALTER TABLE featuretoggles ADD COLUMN feature_name VARCHAR(255) NULL');
    }
    if (!featureColumns.module) {
      await sequelize.query('ALTER TABLE featuretoggles ADD COLUMN module VARCHAR(100) NULL');
    }
    await sequelize.query("UPDATE featuretoggles SET feature_name = feature_key WHERE feature_name IS NULL OR feature_name = ''");
    await sequelize.query("UPDATE featuretoggles SET module = 'SYSTEM' WHERE module IS NULL OR module = ''");
  } catch (err) {
    console.error('[RBAC] feature columns skipped:', err.message);
  }

  try {
    const logColumns = await query.describeTable('activitylogs');
    const additions = [
      ['client_id', 'INT NULL'],
      ['actor_role', 'VARCHAR(100) NULL'],
      ['request_method', 'VARCHAR(20) NULL'],
      ['request_path', 'VARCHAR(255) NULL'],
      ['user_agent', 'VARCHAR(255) NULL'],
      ['metadata', 'JSON NULL'],
      ['previous_hash', 'VARCHAR(64) NULL'],
      ['entry_hash', 'VARCHAR(64) NULL']
    ];
    for (const [column, definition] of additions) {
      if (!logColumns[column]) {
        await sequelize.query(`ALTER TABLE activitylogs ADD COLUMN ${column} ${definition}`);
      }
    }
  } catch (err) {
    console.error('[RBAC] activity log columns skipped:', err.message);
  }

  let roleColumns = {};
  try {
    roleColumns = await query.describeTable('roles');
  } catch (err) {
    console.error('[RBAC] roles table is not available:', err.message);
    return;
  }

  for (const role of ROLES) {
    const [row] = await Role.findOrCreate({
      where: { code: role.code },
      defaults: {
        code: role.code,
        name: role.name,
        description: role.description,
        level: role.level
      }
    });
    if (row.name !== role.name && roleColumns.name) {
      await row.update({ name: role.name, description: role.description, level: role.level });
    }
  }

  let permissionTable = true;
  try {
    await query.describeTable('rolepermissions');
  } catch {
    permissionTable = false;
  }
  if (!permissionTable) return;

  const stored = await Role.findAll({ where: { code: ROLES.map((role) => role.code) } });
  for (const role of stored) {
    const grants = PERMISSIONS[role.code] || {};
    for (const [section, flags] of Object.entries(grants)) {
      if (section === '*') continue;
      const [permission, created] = await RolePermission.findOrCreate({
        where: { role_id: role.id, section },
        defaults: { role_id: role.id, section, ...flagRow(flags) }
      });
      if (!created) await permission.update(flagRow(flags));
    }
  }
}

module.exports = { ensureLedgerRoles };
