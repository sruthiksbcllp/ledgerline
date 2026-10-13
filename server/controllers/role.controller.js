const { Role, RolePermission, Permission, User } = require('../models');
const { sequelize } = require('../models');

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
    // 'ADMIN' (plain Administrator) is retired in favour of Client Administrator — hide it from the
    // role list/assignment for everyone. Existing users on ADMIN keep functioning until migrated.
    const DEPRECATED = ['ADMIN'];
    const filtered = (isProviderAdmin
      ? roles
      : roles.filter(r => !PROVIDER_ONLY.includes(String(r.code || '').toUpperCase())))
      .filter(r => !DEPRECATED.includes(String(r.code || '').toUpperCase()));

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

exports.createRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { role_name, role_description, permissions } = req.body;

    const code = role_name.toUpperCase().replace(/\s+/g, '_');
    const role = await Role.create({
      name: role_name,
      code,
      description: role_description
    }, { transaction });

    if (permissions && Array.isArray(permissions)) {
      for (const p of permissions) {
        const module = (SECTION_MAP[p.section] || p.section || '').toUpperCase();
        const actions = [];
        if (p.can_add) actions.push('CREATE');
        if (p.can_edit) actions.push('EDIT');
        if (p.can_delete) actions.push('DELETE');
        if (p.can_view) actions.push('VIEW');

        for (const action of actions) {
          const perm = await Permission.findOne({
            where: { module, action },
            transaction
          });

          if (perm) {
            await RolePermission.create({
              role_id: role.id,
              permission_id: perm.id
            }, { transaction });
          }
        }
      }
    }

    await transaction.commit();
    res.status(201).json({ success: true, data: role });
  } catch (error) {
    if (transaction) await transaction.rollback();
    res.json({ success: false, message: error.message });
  }
};

exports.updateRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { role_name, role_description, permissions } = req.body;

    const role = await Role.findByPk(id, { transaction });
    if (!role) return res.json({ success: false, message: 'Role not found' });

    await role.update({
      name: role_name,
      description: role_description
    }, { transaction });

    if (permissions && Array.isArray(permissions)) {
      await RolePermission.destroy({ where: { role_id: id }, transaction });

      for (const p of permissions) {
        const module = (SECTION_MAP[p.section] || p.section || '').toUpperCase();
        const actions = [];
        if (p.can_add) actions.push('CREATE');
        if (p.can_edit) actions.push('EDIT');
        if (p.can_delete) actions.push('DELETE');
        if (p.can_view) actions.push('VIEW');

        for (const action of actions) {
          const perm = await Permission.findOne({
            where: { module, action },
            transaction
          });

          if (perm) {
            await RolePermission.create({
              role_id: role.id,
              permission_id: perm.id
            }, { transaction });
          }
        }
      }
    }

    await transaction.commit();
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

    const { User } = require('../models');

    const activeCount = await User.count({ where: { role_id: id, status: 'ACTIVE' } });
    if (activeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${activeCount} active user(s) are assigned to this role.`
      });
    }

    const inactiveCount = await User.count({ where: { role_id: id, status: 'INACTIVE' } });
    if (inactiveCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${inactiveCount} deactivated user(s) are still linked. Reassign them in Manage Users before deleting this role.`
      });
    }

    await role.destroy();
    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};
