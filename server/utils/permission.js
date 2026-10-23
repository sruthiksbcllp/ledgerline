const { User, Role, Permission, RolePermission } = require('../models');
const { isPrivilegedRole } = require('./devRole');
const { roleAllows } = require('../config/rbac');

/**
 * Check if a user has a specific permission
 * @param {Object} user - User object from request
 * @param {string} module - Module name (e.g., 'PR')
 * @param {string} action - Action name (e.g., 'CREATE')
 * @returns {Promise<boolean>}
 */
const hasPermission = async (user, module, action) => {
  if (!user) return false;
  const directCode = user.role || user.role_code;
  if (isPrivilegedRole(directCode) || roleAllows(directCode, module, action)) return true;
  const normalizedActionMap = {
    create: 'add',
    add: 'add',
    update: 'edit',
    edit: 'edit',
    approve: 'edit',
    manage: 'edit',
    remove: 'delete',
    delete: 'delete',
    view: 'view'
  };
  const normalizedAction = normalizedActionMap[String(action || '').toLowerCase()] || String(action || '').toLowerCase();

  // Fetch roles for the user (supporting both single role_id and user_roles mapping)
  const userWithRoles = await User.findByPk(user.id, {
    include: [{
      model: Role,
      as: 'Role',
      include: [{ model: RolePermission, as: 'RolePermissions' }]
    }, {
      model: Role,
      as: 'Roles',
      through: { attributes: [] },
      include: [{ model: RolePermission, as: 'RolePermissions' }]
    }]
  });

  if (!userWithRoles) return false;

  const roles = userWithRoles.Roles || (userWithRoles.Role ? [userWithRoles.Role] : []);

  if (roles.some(r => isPrivilegedRole(r.code))) return true;

  const roleCode = userWithRoles.Role?.code;
  if (roleAllows(roleCode, module, action)) return true;

  for (const role of roles) {
    const rolePermissions = role.RolePermissions || [];
    const match = rolePermissions.some(rp => 
      rp.section === module && 
      (
        (normalizedAction === 'view' && rp.can_view) ||
        (normalizedAction === 'add' && rp.can_add) ||
        (normalizedAction === 'edit' && rp.can_edit) ||
        (normalizedAction === 'delete' && rp.can_delete)
      )
    );
    if (match) return true;
  }

  return false;
};

module.exports = { hasPermission };
