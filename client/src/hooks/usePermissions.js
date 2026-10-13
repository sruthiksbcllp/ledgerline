import { useSelector } from 'react-redux';

// Compatibility map for legacy section names (frontend)
const LEGACY_MODULE_MAP = {
  'Asset Management': 'ASSET',
  'Manage Masters': 'MASTER',
  'Roles & Permissions': 'ROLE',
  'Audit Management': 'AUDIT',
  'Inventory': 'INVENTORY',
  'Finance & CWIP': 'CWIP',
  'Procurement': 'PR'
};

export const usePermissions = () => {
  const { user } = useSelector((state) => state.auth);

  const hasPermission = (section, action = 'VIEW') => {
    if (!user) return false;

    // Admin bypass - Using Codes
    const role = user.role || (user.Role && user.Role.code);
    if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'CLIENT_ADMIN' || role === 'PROVIDER_ADMIN' || role === 'DEV_ADMIN') {
      return true;
    }

    // Fallback for role name (legacy)
    const roleName = (user.role_name || role || '').toLowerCase().trim();
    if (roleName === 'super admin' || roleName === 'admin') return true;
    
    if (!user.permissions || !Array.isArray(user.permissions)) return false;

    const targetModule = (LEGACY_MODULE_MAP[section] || section).toUpperCase();
    const targetAction = action.toUpperCase();

    // Check for new modular permission
    return user.permissions.some(p => {
      const pModule = (p.module || p.section || '').toUpperCase();
      const pAction = (p.action || '').toUpperCase();
      
      // Handle 'ALL' action or specific match
      return pModule === targetModule && (pAction === targetAction || pAction === 'ALL');
    });
  };

  const isSuperAdmin = () => {
    if (!user) return false;
    const role = user.role || (user.Role && user.Role.code);
    if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'CLIENT_ADMIN' || role === 'PROVIDER_ADMIN' || role === 'DEV_ADMIN') return true;
    
    const roleName = (user.role_name || role || '').toLowerCase().trim();
    return roleName === 'super admin' || roleName === 'admin' || roleName === 'provider admin' || roleName === 'dev admin';
  };


  return { hasPermission, isSuperAdmin, user };
};

