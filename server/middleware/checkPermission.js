const { hasPermission } = require('../utils/permission');
const AppError = require('../utils/appError');
const { isPrivilegedRole } = require('../utils/devRole');


const checkPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401));
      }

      // Super Admin & Provider Admin bypass for stability
      const roleCode = (req.user?.Role?.code || req.user?.role_code || req.user?.role || '').toUpperCase();
      if (isPrivilegedRole(roleCode)) {
        return next();
      }


      if (module.startsWith('MASTER_') || module === 'PROPERTY' || module === 'DEPARTMENT') {
        // Allow viewing masters if user is authenticated (minimum requirement)
        if (action === 'VIEW') return next();
      }

      const allowed = await hasPermission(req.user, module, action);
      
      if (!allowed) {
        return next(new AppError(`Access Denied: You do not have ${action} permission for ${module}`, 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = checkPermission;
