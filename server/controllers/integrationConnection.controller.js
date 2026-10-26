'use strict';

/**
 * Settings → Integrations (company connections to Zoho Books, Tally, NetSuite, SAP, GSP,
 * RazorpayX, WhatsApp, ...). Admin-only; every call is scoped to the admin's selected company.
 */
const svc = require('../services/integrations/connection.service');
const { recordAudit } = require('../utils/financeAudit');

const clientIdOf = (req) => req.user?.client_id || null;
const fail = (res, error) => {
  const status = error instanceof svc.IntegrationError ? error.status : 500;
  return res.status(status).json({ success: false, code: error.code || 'ERROR', message: status === 500 ? 'Something went wrong with this integration' : error.message });
};
const audit = (req, provider, action, note) => recordAudit(req, {
  module: 'INTEGRATIONS', entityType: 'INTEGRATION_CONNECTION', entityId: null, action, note: `${provider}${note ? `: ${note}` : ''}`
});

exports.list = async (req, res) => {
  try {
    const data = await svc.listForCompany({ clientId: clientIdOf(req), user: req.user });
    return res.json({ success: true, data, has_company: Boolean(clientIdOf(req)), live: svc.isLive() });
  } catch (error) { return fail(res, error); }
};

exports.oauthStart = async (req, res) => {
  try {
    const url = svc.startAuthorization({ provider: req.params.provider, clientId: clientIdOf(req), userId: req.user.id, input: req.body?.config || {} });
    return res.json({ success: true, data: { url } });
  } catch (error) { return fail(res, error); }
};

// Public by necessity: the provider redirects the browser here. The admin and company come from
// the signed, single-use, 10-minute state, not from a login token.
exports.oauthCallback = async (req, res) => {
  const clientUrl = String(process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, '');
  const back = (params) => res.redirect(`${clientUrl}/security-settings?${new URLSearchParams(params).toString()}#integrations`);
  try {
    const { connection, userId, clientId } = await svc.completeAuthorization({ provider: req.params.provider, query: req.query });
    await recordAudit({ user: { id: userId, client_id: clientId }, ip: req.ip, headers: req.headers }, {
      module: 'INTEGRATIONS', entityType: 'INTEGRATION_CONNECTION', entityId: connection.id, action: 'INTEGRATION_CONNECTED', note: `${connection.provider}: ${connection.account_label}`
    });
    return back({ integration_connected: connection.provider });
  } catch (error) {
    const message = error instanceof svc.IntegrationError ? error.message : 'Could not complete the sign-in';
    return back({ integration: req.params.provider, integration_error: String(message).slice(0, 300) });
  }
};

exports.saveCredentials = async (req, res) => {
  try {
    const row = await svc.saveCredentials({ provider: req.params.provider, clientId: clientIdOf(req), userId: req.user.id, input: req.body?.values || {} });
    await audit(req, row.provider, 'INTEGRATION_CONNECTED', row.account_label);
    const verified = row.status === 'CONNECTED';
    return res.json({ success: true, message: verified ? `Connected: ${row.account_label}` : 'Details saved securely (not verified yet)', data: { status: row.status } });
  } catch (error) { return fail(res, error); }
};

exports.test = async (req, res) => {
  try {
    const out = await svc.testConnection({ provider: req.params.provider, clientId: clientIdOf(req), user: req.user });
    return res.json({ success: true, message: out.message });
  } catch (error) { return fail(res, error); }
};

exports.disconnect = async (req, res) => {
  try {
    const before = await svc.disconnect({ provider: req.params.provider, clientId: clientIdOf(req) });
    await audit(req, before.provider, 'INTEGRATION_DISCONNECTED', before.account_label);
    return res.json({ success: true, message: 'Disconnected' });
  } catch (error) { return fail(res, error); }
};
