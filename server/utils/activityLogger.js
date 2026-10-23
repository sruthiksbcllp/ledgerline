'use strict';
const activityLogger = require('../services/activityLogger');

/**
 * Enterprise Activity Logger (Step 9)
 * Logs all critical actions, especially for PROVIDER_ADMIN.
 */
const logActivity = async ({ user_id, role, action, module: moduleName, metadata = {}, client_id = null }) => {
  try {
    activityLogger.log({
      user_id,
      action,
      module: moduleName || 'SYSTEM',
      role,
      actor_role: role,
      metadata: {
        ...metadata,
        role: role,
        timestamp: new Date().toISOString()
      },
      client_id: client_id || null
    });


    if (role === 'PROVIDER_ADMIN') {
      console.log(`[PROVIDER AUDIT] Admin ${user_id} performed: ${action}`);
    }
  } catch (err) {
    console.error('FAILED TO LOG ACTIVITY:', err.message);
  }
};

module.exports = { logActivity };
