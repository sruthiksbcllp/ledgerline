const { ActivityLog } = require('../models');

/**
 * Logs a differential change (Old vs New)
 */
exports.logChange = async ({ 
  user_id, 
  action, 
  module, 
  record_id, 
  old_value = null, 
  new_value = null, 
  ip_address = '0.0.0.0' 
}) => {
  try {
    await ActivityLog.create({
      user_id,
      action,
      module,
      record_id,
      old_value: old_value ? JSON.stringify(old_value) : null,
      new_value: new_value ? JSON.stringify(new_value) : null,
      ip_address,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Audit logging failed:', error);
  }
};
