const { Role, RolePermission } = require('../models');
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

  // Custom per-role grants (edited in Roles & Permissions) for the role of the company this session
  // is in. Deliberately NOT the roles stored on the user account: someone can hold different roles
  // in different companies, and their role in one company must never grant access in another.
  if (!directCode) return false;
  const role = await Role.findOne({
    where: { code: String(directCode).toUpperCase() },
    include: [{ model: RolePermission, as: 'RolePermissions' }]
  });
  if (!role) return false;
  const match = (role.RolePermissions || []).some(rp =>
    rp.section === module &&
    (
      (normalizedAction === 'view' && rp.can_view) ||
      (normalizedAction === 'add' && rp.can_add) ||
      (normalizedAction === 'edit' && rp.can_edit) ||
      (normalizedAction === 'delete' && rp.can_delete)
    )
  );
  if (match) return true;

  return false;
};

module.exports = { hasPermission };
