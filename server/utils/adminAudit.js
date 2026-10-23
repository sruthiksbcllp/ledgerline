'use strict';

const activityLogger = require('../services/activityLogger');

const recordAdminAction = (req, { action, module, recordId, description, oldValues, newValues }) => {
  activityLogger.log({
    user_id: req.user?.id,
    action,
    module,
    record_id: recordId || null,
    description,
    old_values: oldValues || null,
    new_values: newValues || null,
    actor_role: req.user?.role || null,
    client_id: req.user?.client_id || null,
    ip_address: req.ip || null,
    request_method: req.method,
    request_path: req.originalUrl,
    user_agent: req.get ? req.get('user-agent') : null
  });
};

module.exports = { recordAdminAction };
