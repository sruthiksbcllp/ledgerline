'use strict';

const DEV_ADMIN_ROLE = 'DEV_ADMIN';

const isNonProduction = () => String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';

const isDevAdminRole = (role) => isNonProduction() && String(role || '').toUpperCase() === DEV_ADMIN_ROLE;

const isPrivilegedRole = (role) => {
  const roleCode = String(role || '').toUpperCase();
  return ['SUPER_ADMIN', 'PROVIDER_ADMIN', 'ADMIN', 'CLIENT_ADMIN'].includes(roleCode) || isDevAdminRole(roleCode);
};

module.exports = { DEV_ADMIN_ROLE, isNonProduction, isDevAdminRole, isPrivilegedRole };
