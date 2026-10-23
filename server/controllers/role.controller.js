const { Role, RolePermission, User } = require('../models');
const { sequelize } = require('../models');
const { ROLES, PRIVILEGED_CODES } = require('../config/rbac');
const { recordAdminAction } = require('../utils/adminAudit');

const SYSTEM_ROLE_CODES = new Set([...ROLES.map((role) => role.code), ...PRIVILEGED_CODES, 'SUPER_ADMIN']);
const PLATFORM_ROLE_CODES = new Set(['PROVIDER_ADMIN', 'DEV_ADMIN', 'SUPER_ADMIN']);

exports.getAllRoles = async (req, res) => {
  try {
    const roleCode = String(req.user?.role || '').toUpperCase();
    const isProviderAdmin = roleCode === 'PROVIDER_ADMIN' || roleCode === 'DEV_ADMIN';

    // Tenant-scope the per-role user count for tenant admins (a Client Admin must not see
    // platform-wide counts). Provider admins keep the global count (they manage all tenants).
    // client_id is coerced to an integer -> safe to inline in the literal.
    const clientId = req.user?.client_id;
    const scopeToTenant = !isProviderAdmin && clientId != null && !Number.isNaN(parseInt(clientId, 10));
    const countWhere = scopeToTenant
      ? `WHERE u.role_id = Role.id AND u.client_id = ${parseInt(clientId, 10)}`
      : `WHERE u.role_id = Role.id`;

    const roles = await Role.findAll({
      attributes: [
        'id',
        'code',
        ['name', 'role_name'],
        ['description', 'role_description'],
        [
          sequelize.literal(`(
            SELECT COUNT(*)
            FROM users AS u
            ${countWhere}
          )`),
          'user_count'
        ]
      ],
      include: [{ model: RolePermission }]
    });

    // Non-provider admins must never see PROVIDER_ADMIN or DEV_ADMIN roles.
    const PROVIDER_ONLY = ['PROVIDER_ADMIN', 'DEV_ADMIN'];
    const filtered = isProviderAdmin
      ? roles
      : roles.filter(r => !PROVIDER_ONLY.includes(String(r.code || '').toUpperCase()));

    return res.json({
      success: true,
      data: filtered || []
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      data: [],
      message: error.message || 'Failed to fetch roles'
    });
  }
};

const SECTION_MAP = {
  'Users': 'USER',
  'Roles & Permissions': 'ROLE',
  'Property Management': 'PROPERTY',
  'Asset Management': 'ASSET',
  'Procurement': 'PR',
  'Finance & CWIP': 'FINANCE',
  'Audit Management': 'AUDIT',
  'Request Management': 'REQUEST',
  'Maintenance Management': 'MAINTENANCE',
  'Manage Masters': 'MASTER',
  'System Settings': 'SYSTEM',
  'Asset Accounting': 'ACCOUNTING',
  'Asset Tracking': 'TRACKING',
  'Asset Performance Management': 'PERFORMANCE',
  'Insurance Management': 'INSURANCE',
  'Reports': 'REPORT'
};

const MODULE_MAP = Object.fromEntries(Object.entries(SECTION_MAP).map(([k, v]) => [v, k]));

exports.getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await Role.findByPk(id, {
      include: [{ model: RolePermission }]
    });

    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

    const permissionsBySection = {};
    (role.RolePermissions || []).forEach((permission) => {
      const sectionName = MODULE_MAP[permission.section] || permission.section;
      permissionsBySection[sectionName] = {
        section: sectionName,
        can_add: Boolean(permission.can_add),
        can_edit: Boolean(permission.can_edit),
        can_delete: Boolean(permission.can_delete),
        can_view: Boolean(permission.can_view)
      };
    });

    const mappedRole = {
      ...role.toJSON(),
      role_name: role.name,
      role_description: role.description,
      RolePermissions: Object.values(permissionsBySection)
    };

    res.json({ success: true, data: mappedRole });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch role' });
  }
};

const saveSectionPermissions = async (roleId, permissions, transaction) => {
  if (!Array.isArray(permissions)) return;
  for (const permission of permissions) {
    const section = (SECTION_MAP[permission.section] || permission.section || '').toString().trim().toUpperCase();
    if (!section) continue;
    const flags = {
      can_add: Boolean(permission.can_add),
      can_edit: Boolean(permission.can_edit),
      can_delete: Boolean(permission.can_delete),
      can_view: Boolean(permission.can_view)
    };
    const [row, created] = await RolePermission.findOrCreate({
      where: { role_id: roleId, section },
      defaults: { role_id: roleId, section, ...flags },
      transaction
    });
    if (!created) await row.update(flags, { transaction });
  }
};

exports.createRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { role_name, role_description, permissions } = req.body;
    const name = String(role_name || '').trim();
    if (!name) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Role name is required' });
    }
    const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (PLATFORM_ROLE_CODES.has(code) || code === 'ADMIN') {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'That role name is reserved' });
    }
    const existing = await Role.findOne({ where: { code }, transaction });
    if (existing) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'A role with this name already exists' });
    }
    const role = await Role.create({
      name,
      code,
      description: role_description || null,
      level: 15
    }, { transaction });

    await saveSectionPermissions(role.id, permissions, transaction);
    await transaction.commit();
    recordAdminAction(req, {
      action: 'ROLE_CREATED',
      module: 'ROLE',
      recordId: role.id,
      description: `Created role ${role.name}`,
      newValues: { code: role.code, name: role.name }
    });
    res.status(201).json({ success: true, data: role });
  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { role_name, role_description, permissions } = req.body;

    const role = await Role.findByPk(id, { transaction });
    if (!role) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    const actor = String(req.user?.role || '').toUpperCase();
    if (PLATFORM_ROLE_CODES.has(String(role.code).toUpperCase()) && !PLATFORM_ROLE_CODES.has(actor)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'You cannot change a platform role' });
    }

    const nextName = String(role_name || role.name).trim();
    await role.update({
      name: SYSTEM_ROLE_CODES.has(String(role.code).toUpperCase()) ? role.name : nextName,
      description: role_description
    }, { transaction });

    await saveSectionPermissions(role.id, permissions, transaction);

    await transaction.commit();
    recordAdminAction(req, {
      action: 'ROLE_PERMISSIONS_UPDATED',
      module: 'ROLE',
      recordId: role.id,
      description: `Updated role ${role.name}`,
      newValues: { name: role.name, sections: Array.isArray(permissions) ? permissions.length : 0 }
    });
    res.json({ success: true, data: role });
  } catch (error) {
    if (transaction) await transaction.rollback();
    res.json({ success: false, message: error.message });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await Role.findByPk(id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (SYSTEM_ROLE_CODES.has(String(role.code || '').toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Built-in roles cannot be deleted' });
    }

    const { User } = require('../models');

    const activeCount = await User.count({ where: { role_id: id, status: 'ACTIVE' } });
    if (activeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${activeCount} active user(s) are assigned to this role.`
      });
    }

    const inactiveCount = await User.count({ where: { role_id: id, status: ['INACTIVE', 'SUSPENDED'] } });
    if (inactiveCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${inactiveCount} deactivated or suspended user(s) are still linked. Reassign them in Manage Users before deleting this role.`
      });
    }

    await role.destroy();
    recordAdminAction(req, {
      action: 'ROLE_DELETED',
      module: 'ROLE',
      recordId: Number(id),
      description: `Deleted role ${role.name}`,
      oldValues: { code: role.code, name: role.name }
    });
    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};
