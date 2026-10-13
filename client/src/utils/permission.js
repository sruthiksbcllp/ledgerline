/**
 * Check if the current user has a specific permission
 * @param {Object} user - Logged in user object
 * @param {string} module - Module name (e.g., 'PR')
 * @param {string} action - Action name (e.g., 'CREATE')
 * @returns {boolean}
 */
export const hasPermission = (user, module, action) => {
  if (!user) return false;

  // Roles can be in user.Role or user.Roles (array)
  const roles = user.Roles || (user.Role ? [user.Role] : []);
  
  // Admin bypass
  if (roles.some(r => ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'].includes(r.code))) return true;

  // Check permissions in all assigned roles
  for (const role of roles) {
    const permissions = role.Permissions || [];
    const match = permissions.some(p => 
      p.module.toUpperCase() === module.toUpperCase() && 
      p.action.toUpperCase() === action.toUpperCase()
    );
    if (match) return true;
  }

  return false;
};
