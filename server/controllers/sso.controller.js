'use strict';
const { getClientId } = require('../utils/tenantFilter');

// ── Gap 17: SSO Config Management ─────────────────────────────────────────────
exports.getSSOConfig = async (req, res) => {
  try {
    const { SsoConfig } = require('../models');
    const clientId = getClientId(req);
    const configs = await SsoConfig.findAll({ where: { client_id: clientId } });
    res.json({ success: true, data: configs });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.upsertSSOConfig = async (req, res) => {
  try {
    const { SsoConfig } = require('../models');
    const clientId = getClientId(req);
    const { provider } = req.body;
    const [config, created] = await SsoConfig.findOrCreate({
      where: { client_id: clientId, provider },
      defaults: { ...req.body, client_id: clientId }
    });
    if (!created) await config.update(req.body);
    res.json({ success: true, data: config, message: created ? 'SSO config created' : 'SSO config updated' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteSSOConfig = async (req, res) => {
  try {
    const { SsoConfig } = require('../models');
    await SsoConfig.destroy({ where: { id: req.params.id } });
    res.json({ success: true, message: 'SSO config deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// SAML callback — would be wired to passport-saml in production
exports.samlCallback = async (req, res) => {
  try {
    // In production: validate SAML assertion, extract attributes, find/create user, issue JWT
    // For now: stub that shows the flow is wired
    res.json({ success: true, message: 'SAML callback endpoint ready — configure IdP to post here' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// OIDC callback
exports.oidcCallback = async (req, res) => {
  try {
    res.json({ success: true, message: 'OIDC callback endpoint ready — configure provider redirect here' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
