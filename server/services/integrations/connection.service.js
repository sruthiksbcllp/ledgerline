'use strict';

/**
 * Company connections to external apps (Settings → Integrations).
 *
 * OAuth apps (Zoho Books, NetSuite): Connect -> the admin signs in at the provider ->
 * the provider redirects to /api/integrations/oauth/:provider/callback with a code -> we exchange it
 * (server side, with the client secret from .env), prove the token works with a read-only call
 * and store the tokens encrypted. Access tokens are refreshed automatically by accessTokenFor().
 *
 * Credential apps (Tally, SAP, GSP, RazorpayX, WhatsApp): the admin enters API details; secrets are
 * encrypted, verified against the provider before saving, and never returned to the browser.
 *
 * Pending sign-ins live in memory for 10 minutes (one API instance, as for mailbox sign-in).
 *
 * Preview mode: until INTEGRATIONS_LIVE=true, the page lists every app with a Connect button but
 * nothing calls a provider: connect / save / test are refused here, not just hidden in the UI.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { IntegrationConnection, UserMailAccount, User } = require('../../models');
const { PROVIDERS, providerOf, missingEnv, env } = require('./providers');
const {
  IntegrationError, encryptSecret, decryptSecret, encryptJson, decryptJson, isStorageReady, httpRequest, basicAuth, b64url
} = require('./common');

const STATE_TTL_MS = 10 * 60 * 1000;
const pending = new Map(); // nonce -> { clientId, userId, provider, verifier, config, expires }
const PLATFORM_ROLES = ['PROVIDER_ADMIN', 'DEV_ADMIN'];

const isLive = () => process.env.INTEGRATIONS_LIVE === 'true';
const requireLive = (key) => {
  if (!isLive()) {
    throw new IntegrationError(`${providerOf(key).name} will be available once LedgerLine integrations are activated.`, 503, 'NOT_ACTIVATED');
  }
};

const redirectUri = (key) => {
  const base = (process.env.OAUTH_REDIRECT_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');
  return `${base}/api/integrations/oauth/${key}/callback`;
};

/** What the server still needs before this app can be connected (OAuth app keys, storage key). */
function setupOf(key) {
  const p = providerOf(key);
  const missing = missingEnv(p.requiredEnv || []);
  if ((p.auth === 'oauth2' || p.auth === 'credentials') && !isStorageReady()) missing.push('INTEGRATION_CREDENTIALS_KEY');
  return { ready: missing.length === 0, missingEnv: missing };
}

// ── Field validation ─────────────────────────────────────────────────────────
function cleanFields(p, input = {}, { secretsOnly = false, existingSecrets = {} } = {}) {
  const config = {};
  const secrets = {};
  for (const f of p.fields) {
    if (secretsOnly && !f.secret) continue;
    let value = input[f.name];
    value = value === undefined || value === null ? '' : String(value).trim();
    if (f.uppercase) value = value.toUpperCase();
    if (f.secret && !value && existingSecrets[f.name]) { secrets[f.name] = existingSecrets[f.name]; continue; } // keep saved secret
    if (!value) {
      if (f.required) throw new IntegrationError(`${f.label} is required`, 400, 'FIELD_REQUIRED');
      continue;
    }
    if (value.length > 2000) throw new IntegrationError(`${f.label} is too long`, 400, 'FIELD_INVALID');
    if (f.pattern && !new RegExp(f.pattern).test(value)) throw new IntegrationError(`${f.label} is not in the expected format`, 400, 'FIELD_INVALID');
    if (f.type === 'select' && f.options && !f.options.includes(value)) throw new IntegrationError(`Choose a valid ${f.label}`, 400, 'FIELD_INVALID');
    (f.secret ? secrets : config)[f.name] = value;
  }
  return { config, secrets };
}

// ── Public views (never include secrets or tokens) ───────────────────────────
const userName = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : null);
function publicConnection(p, row) {
  if (!row) return null;
  const { organizations, ...config } = row.config || {};
  const secretNames = p.fields.filter((f) => f.secret).map((f) => f.name);
  let secretsSet = {};
  if (row.secrets_enc) {
    try {
      const s = decryptJson(row.secrets_enc);
      secretsSet = Object.fromEntries(secretNames.map((n) => [n, Boolean(s[n])]));
    } catch (_) { secretsSet = {}; }
  }
  return {
    status: row.status,
    account_label: row.account_label,
    external_account_id: row.external_account_id,
    config: Object.fromEntries(Object.entries(config).filter(([k]) => !['accounts_server', 'api_domain'].includes(k))),
    organizations: organizations || undefined,
    secrets_set: secretsSet,
    connected_at: row.connected_at,
    connected_by: userName(row.ConnectedBy),
    last_checked_at: row.last_checked_at,
    last_error: row.last_error
  };
}

/** Every integration with its setup state and this company's connection, for the Settings page. */
async function listForCompany({ clientId, user }) {
  const rows = clientId
    ? await IntegrationConnection.findAll({ where: { client_id: clientId }, include: [{ model: User, as: 'ConnectedBy', attributes: ['first_name', 'last_name', 'email'] }] })
    : [];
  const byKey = Object.fromEntries(rows.map((r) => [r.provider, r]));
  const mailbox = user?.id ? await UserMailAccount.findOne({ where: { user_id: user.id }, attributes: ['from_email', 'provider', 'verified_at', 'last_error'] }).catch(() => null) : null;
  const isPlatformAdmin = PLATFORM_ROLES.includes(String(user?.role || '').toUpperCase());

  return Object.entries(PROVIDERS).map(([key, p]) => {
    const setup = setupOf(key);
    const item = {
      key,
      name: p.name,
      category: p.category,
      description: p.description,
      planned: p.planned || [],
      auth: p.auth,
      docs_url: p.docsUrl || null,
      note: p.note || null,
      link: p.link || null,
      fields: p.fields.map(({ name, label, type, required, secret, placeholder, help, options, pattern, defaultEnv }) => ({
        name, label, type, required: Boolean(required), secret: Boolean(secret), placeholder, help, options, pattern,
        default_value: defaultEnv ? env(defaultEnv) || undefined : undefined
      })),
      setup,
      redirect_uri: p.auth === 'oauth2' ? redirectUri(key) : undefined,
      can_verify: Boolean(p.verify),
      connection: null
    };
    if (p.auth === 'link') {
      item.connection = mailbox && mailbox.verified_at
        ? { status: mailbox.last_error ? 'ERROR' : 'CONNECTED', account_label: mailbox.from_email, last_error: mailbox.last_error }
        : null;
    } else if (p.auth === 'platform') {
      item.connection = setup.ready ? { status: 'CONFIGURED', account_label: env('AWS_REGION') } : null;
      item.can_verify = Boolean(p.verify) && isPlatformAdmin && setup.ready && isLive();
    } else {
      item.connection = publicConnection(p, byKey[key]);
    }
    return item;
  });
}

const requireCompany = (clientId) => {
  if (!clientId) throw new IntegrationError('Select a company first. Integrations are connected per company.', 400, 'NO_COMPANY');
};
const requireConnectable = (key, auth) => {
  requireLive(key);
  const p = providerOf(key);
  if (p.auth !== auth) throw new IntegrationError(`${p.name} is not connected this way`, 400, 'WRONG_AUTH');
  const setup = setupOf(key);
  if (!setup.ready) {
    throw new IntegrationError(`${p.name} is not set up on the server yet. Missing: ${setup.missingEnv.join(', ')}.`, 503, 'SETUP_REQUIRED');
  }
  return p;
};

async function upsert(clientId, key, values) {
  const existing = await IntegrationConnection.findOne({ where: { client_id: clientId, provider: key } });
  return existing ? existing.update(values) : IntegrationConnection.create({ client_id: clientId, provider: key, ...values });
}

// ── OAuth ────────────────────────────────────────────────────────────────────
/** Builds the provider sign-in URL (signed single-use state; PKCE where the provider supports it). */
function startAuthorization({ provider: key, clientId, userId, input }) {
  requireCompany(clientId);
  const p = requireConnectable(key, 'oauth2');
  const { config } = cleanFields(p, input);
  const o = p.oauth;
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = o.pkce ? b64url(crypto.randomBytes(48)) : null;
  pending.set(nonce, { clientId, userId, provider: key, verifier, config, expires: now + STATE_TTL_MS });
  const state = jwt.sign({ n: nonce, p: key, purpose: 'integration-connect' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: o.clientId(),
    redirect_uri: redirectUri(key),
    response_type: 'code',
    scope: o.scope(),
    state,
    ...(verifier ? { code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' } : {}),
    ...(o.extraAuthParams || {})
  });
  return `${o.authorizeUrl(config)}?${params.toString()}`;
}

async function tokenRequest(p, config, body) {
  const o = p.oauth;
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const form = new URLSearchParams(body);
  if (o.clientAuth === 'basic') headers.Authorization = basicAuth(o.clientId(), o.clientSecret());
  else { form.set('client_id', o.clientId()); form.set('client_secret', o.clientSecret()); }
  const res = await httpRequest(o.tokenUrl(config), { method: 'POST', headers, body: form.toString() });
  const data = res.body || {};
  if (!res.ok || data.error || !data.access_token) {
    const reconnect = data.error === 'invalid_grant' || data.error === 'invalid_code';
    throw new IntegrationError(data.error_description || data.error || `Token request failed (${res.status})`, reconnect ? 409 : 502, reconnect ? 'RECONNECT' : 'OAUTH_TOKEN_FAILED');
  }
  return data;
}

/** Completes the sign-in after the provider redirects back. Returns { connection, userId, clientId }. */
async function completeAuthorization({ provider: key, query }) {
  let claims;
  try {
    claims = jwt.verify(String(query.state || ''), process.env.JWT_SECRET);
  } catch (_) {
    throw new IntegrationError('This sign-in link has expired. Click Connect again.', 400, 'OAUTH_STATE_INVALID');
  }
  const entry = claims.purpose === 'integration-connect' && claims.p === key ? pending.get(claims.n) : null;
  pending.delete(claims.n); // single use, even on failure
  if (!entry || entry.expires < Date.now()) throw new IntegrationError('This sign-in link has expired. Click Connect again.', 400, 'OAUTH_STATE_INVALID');
  const p = providerOf(key);
  if (query.error) {
    throw new IntegrationError(query.error === 'access_denied' ? `You cancelled the ${p.name} sign-in, so nothing was connected.` : String(query.error_description || query.error), 400, 'OAUTH_DENIED');
  }
  if (!query.code) throw new IntegrationError(`${p.name} did not return an authorization code.`, 400, 'OAUTH_NO_CODE');
  requireConnectable(key, 'oauth2');

  let config = p.oauth.onCallback ? p.oauth.onCallback(query, entry.config) : entry.config;
  const tokens = await tokenRequest(p, config, {
    grant_type: 'authorization_code',
    code: String(query.code),
    redirect_uri: redirectUri(key),
    ...(entry.verifier ? { code_verifier: entry.verifier } : {})
  });
  if (!tokens.refresh_token) throw new IntegrationError(`${p.name} did not grant offline access. Remove LedgerLine from the app's connected apps and connect again.`, 400, 'OAUTH_NO_REFRESH');
  if (p.oauth.afterToken) config = p.oauth.afterToken(tokens, config);

  const verified = await p.verify({ config, secrets: {}, accessToken: tokens.access_token });
  const connection = await upsert(entry.clientId, key, {
    status: 'CONNECTED',
    account_label: verified.label,
    external_account_id: verified.externalId || null,
    config: verified.config || config,
    secrets_enc: null,
    access_token_enc: encryptSecret(tokens.access_token),
    refresh_token_enc: encryptSecret(tokens.refresh_token),
    token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000),
    scopes: String(tokens.scope || p.oauth.scope()).slice(0, 1000),
    connected_by: entry.userId,
    connected_at: new Date(),
    last_checked_at: new Date(),
    last_error: null
  });
  return { connection, userId: entry.userId, clientId: entry.clientId };
}

/** A valid access token for an OAuth connection, refreshing and re-saving it when needed. For sync code. */
async function accessTokenFor(row) {
  const p = providerOf(row.provider);
  if (!p.oauth) throw new IntegrationError(`${p.name} does not use OAuth`, 400, 'WRONG_AUTH');
  if (row.access_token_enc && row.token_expires_at && new Date(row.token_expires_at).getTime() - Date.now() > 60000) {
    return decryptSecret(row.access_token_enc);
  }
  requireConnectable(row.provider, 'oauth2');
  try {
    const tokens = await tokenRequest(p, row.config || {}, { grant_type: 'refresh_token', refresh_token: decryptSecret(row.refresh_token_enc) });
    await row.update({
      access_token_enc: encryptSecret(tokens.access_token),
      token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000),
      ...(tokens.refresh_token ? { refresh_token_enc: encryptSecret(tokens.refresh_token) } : {})
    });
    return tokens.access_token;
  } catch (e) {
    if (e.code === 'RECONNECT') {
      await row.update({ status: 'ERROR', last_error: `${p.name} access was revoked or expired. Connect again.` });
      throw new IntegrationError(`${p.name} access was revoked or has expired. Connect again.`, 409, 'RECONNECT');
    }
    throw e;
  }
}

// ── Credentials ──────────────────────────────────────────────────────────────
/** Saves API details for a credential app; verified live first when the app supports it. */
async function saveCredentials({ provider: key, clientId, userId, input }) {
  requireCompany(clientId);
  const p = requireConnectable(key, 'credentials');
  const existing = await IntegrationConnection.findOne({ where: { client_id: clientId, provider: key } });
  const existingSecrets = existing?.secrets_enc ? decryptJson(existing.secrets_enc) : {};
  const { config, secrets } = cleanFields(p, input, { existingSecrets });
  const check = p.verify || p.validate;
  const result = check ? await check({ config, secrets }) : { config };
  return upsert(clientId, key, {
    status: p.verify ? 'CONNECTED' : 'SAVED',
    account_label: result.label || null,
    external_account_id: result.externalId || null,
    config: result.config || config,
    secrets_enc: encryptJson(secrets),
    access_token_enc: null,
    refresh_token_enc: null,
    token_expires_at: null,
    connected_by: userId,
    connected_at: new Date(),
    last_checked_at: p.verify ? new Date() : null,
    last_error: null
  });
}

/** Re-runs the live check. Records the outcome on the connection; returns { ok, message }. */
async function testConnection({ provider: key, clientId, user }) {
  const p = providerOf(key);
  requireLive(key);
  if (p.auth === 'platform') {
    if (!PLATFORM_ROLES.includes(String(user?.role || '').toUpperCase())) throw new IntegrationError('Only the LedgerLine platform team can check server-wide services.', 403, 'FORBIDDEN');
    const setup = setupOf(key);
    if (!setup.ready) throw new IntegrationError(`Not set up on the server. Missing: ${setup.missingEnv.join(', ')}.`, 503, 'SETUP_REQUIRED');
    const out = await p.verify({});
    return { ok: true, message: `Connected: ${out.label}` };
  }
  requireCompany(clientId);
  if (!p.verify) throw new IntegrationError(`A live check for ${p.name} is not available yet. Your details are saved securely.`, 501, 'NO_VERIFY');
  const row = await IntegrationConnection.findOne({ where: { client_id: clientId, provider: key } });
  if (!row) throw new IntegrationError(`${p.name} is not connected`, 404, 'NOT_CONNECTED');
  try {
    const accessToken = p.oauth ? await accessTokenFor(row) : undefined;
    const out = await p.verify({ config: row.config || {}, secrets: row.secrets_enc ? decryptJson(row.secrets_enc) : {}, accessToken });
    await row.update({ status: 'CONNECTED', account_label: out.label, config: out.config || row.config, last_checked_at: new Date(), last_error: null });
    return { ok: true, message: `${p.name} is connected: ${out.label}` };
  } catch (e) {
    await row.update({ status: 'ERROR', last_checked_at: new Date(), last_error: String(e.message).slice(0, 500) }).catch(() => {});
    throw e;
  }
}

/** Removes the connection and its stored secrets; revokes the OAuth grant where the provider allows. */
async function disconnect({ provider: key, clientId }) {
  requireCompany(clientId);
  const p = providerOf(key);
  const row = await IntegrationConnection.findOne({ where: { client_id: clientId, provider: key } });
  if (!row) throw new IntegrationError(`${p.name} is not connected`, 404, 'NOT_CONNECTED');
  if (p.oauth?.revoke && row.refresh_token_enc) {
    try { await p.oauth.revoke({ config: row.config || {}, refreshToken: decryptSecret(row.refresh_token_enc) }); } catch (_) { /* best effort */ }
  }
  const before = { provider: key, account_label: row.account_label, status: row.status };
  await row.destroy();
  return before;
}

module.exports = {
  isLive, listForCompany, startAuthorization, completeAuthorization, accessTokenFor,
  saveCredentials, testConnection, disconnect, redirectUri, IntegrationError
};
