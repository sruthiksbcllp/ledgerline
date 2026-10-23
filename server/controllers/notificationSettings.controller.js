'use strict';
const { User } = require('../models');
const { success, error } = require('../utils/responseHandler');
const { getClientId } = require('../utils/tenantFilter');
const { Op } = require('sequelize');

// GET /api/notification-settings/recipients — tenant's active users + their recipient flag
exports.getRecipients = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const where = { status: 'ACTIVE' };
    if (clientId) where.client_id = clientId;
    const users = await User.findAll({
      where,
      attributes: ['id', 'first_name', 'last_name', 'email', 'receive_notifications'],
      order: [['first_name', 'ASC']]
    });
    return success(res, users);
  } catch (e) { return error(res, e.message); }
};

// PUT /api/notification-settings/recipients — set the selected users as the digest recipients
exports.setRecipients = async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return error(res, 'Tenant context required to set notification recipients', 400);
    const { user_ids } = req.body;
    if (!Array.isArray(user_ids)) return error(res, 'user_ids must be an array', 400);
    // Reset all tenant users to false, then flag the selected ones true (tenant-scoped).
    await User.update({ receive_notifications: false }, { where: { client_id: clientId } });
    if (user_ids.length) {
      await User.update({ receive_notifications: true }, { where: { client_id: clientId, id: { [Op.in]: user_ids } } });
    }
    return success(res, { selected: user_ids.length }, 'Notification recipients updated');
  } catch (e) { return error(res, e.message); }
};
