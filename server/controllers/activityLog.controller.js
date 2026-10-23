'use strict';
const { ActivityLog, User } = require('../models');
const { Op } = require('sequelize');

exports.getLogs = async (req, res, next) => {
  try {
    const { module, action, startDate, endDate, limit = 100, offset = 0 } = req.query;
    let where = {};

    if (module) where.module = module;
    if (action) where.action = action;
    if (startDate && endDate) {
      where.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    } else if (startDate) {
      where.created_at = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      where.created_at = { [Op.lte]: new Date(endDate) };
    }

    // Tenant scope: PROVIDER_ADMIN sees all; others filter directly by client_id on the log
    const clientId = req.user?.client_id;
    const role = String(req.user?.role || '').toUpperCase();
    const isPlatformAdmin = ['PROVIDER_ADMIN', 'DEV_ADMIN', 'SUPER_ADMIN'].includes(role);
    if (!isPlatformAdmin) {
      if (!clientId) {
        return res.json({ success: true, data: { count: 0, rows: [] } });
      }
      where.client_id = clientId;
    }

    const logs = await ActivityLog.findAndCountAll({
      where,
      include: [{
        model: User,
        attributes: ['id', 'first_name', 'last_name', 'username'],
        required: false
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load activity logs' });
  }
};
