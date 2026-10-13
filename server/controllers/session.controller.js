'use strict';
const crypto = require('crypto');
const { getClientId } = require('../utils/tenantFilter');

exports.getActiveSessions = async (req, res) => {
  try {
    const { SessionRegistry } = require('../models');
    const sessions = await SessionRegistry.findAll({
      where: { user_id: req.user.id, is_active: true },
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: sessions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.revokeSession = async (req, res) => {
  try {
    const { SessionRegistry } = require('../models');
    await SessionRegistry.update({ is_active: false }, { where: { id: req.params.id, user_id: req.user.id } });
    res.json({ success: true, message: 'Session revoked' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.revokeAllSessions = async (req, res) => {
  try {
    const { SessionRegistry } = require('../models');
    await SessionRegistry.update({ is_active: false }, { where: { user_id: req.user.id } });
    res.json({ success: true, message: 'All sessions revoked' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getSessionConfig = async (req, res) => {
  try {
    const { Client } = require('../models');
    const clientId = getClientId(req);
    if (!clientId) return res.json({ success: true, data: { idle_timeout_minutes: 30, max_concurrent_sessions: 5 } });
    const client = await Client.findByPk(clientId, { attributes: ['idle_timeout_minutes', 'max_concurrent_sessions', 'ip_whitelist'] });
    res.json({ success: true, data: client || {} });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateSessionConfig = async (req, res) => {
  try {
    const { Client } = require('../models');
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, message: 'Client context required' });
    await Client.update({
      idle_timeout_minutes: req.body.idle_timeout_minutes,
      max_concurrent_sessions: req.body.max_concurrent_sessions,
      ip_whitelist: req.body.ip_whitelist
    }, { where: { id: clientId } });
    res.json({ success: true, message: 'Session config updated' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
