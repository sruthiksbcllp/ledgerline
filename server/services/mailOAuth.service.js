'use strict';

/**
 * One-click mailbox connection with Google (Gmail API) or Microsoft 365 / Outlook (Graph).
 *
 * Flow: the admin clicks Connect -> is sent to Google/Microsoft to sign in and approve
 * "send email as you" -> the provider redirects back to /api/oauth/mail/:provider/callback
 * with a code -> we exchange it for tokens, confirm the account is the admin's own login
 * email and store the tokens encrypted. Sending uses the Gmail / Graph API with a
 * short-lived access token, refreshed automatically. No password is ever handled.
 *
 * Needs a one-time app registration; credentials come from .env:
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
 *   MICROSOFT_OAUTH_CLIENT_ID, MICROSOFT_OAUTH_CLIENT_SECRET, MICROSOFT_OAUTH_TENANT (default "common")
 *   OAUTH_REDIRECT_BASE_URL (public URL of this API, default http://localhost:<PORT>)
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const MailComposer = require('nodemailer/lib/mail-composer');
const { UserMailAccount, User } = require('../models');
const { encryptSecret, decryptSecret, MailboxError } = require('./userMailbox.service');

const PROVIDERS = {
  google: {
    code: 'GOOGLE',
    label: 'Google',
    clientId: () => process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: () => 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile https://www.googleapis.com/auth/gmail.send',
    extraAuthParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' }
  },
  microsoft: {
    code: 'MICROSOFT',
    label: 'Outlook',
    clientId: () => process.env.MICROSOFT_OAUTH_CLIENT_ID,
    clientSecret: () => process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
    authUrl: () => `https://login.microsoftonline.com/${process.env.MICROSOFT_OAUTH_TENANT || 'common'}/oauth2/v2.0/authorize`,
    tokenUrl: () => `https://login.microsoftonline.com/${process.env.MICROSOFT_OAUTH_TENANT || 'common'}/oauth2/v2.0/token`,
    // Sending only. Reading vendor replies (Mail.Read) is requested separately and only when the admin
    // asks for it, because many organisations require admin approval for it and it must never block sending.
    scope: 'openid email profile offline_access User.Read Mail.Send',
    readScope: 'Mail.Read',
    extraAuthParams: { prompt: 'select_account' }
  }
};
const CODE_FOR = { GOOGLE: 'google', MICROSOFT: 'microsoft' };
const STATE_TTL_MS = 10 * 60 * 1000;
const pending = new Map(); // nonce -> { userId, provider, verifier, returnTo, expires }

const providerOf = (name) => {
  const p = PROVIDERS[String(name || '').toLowerCase()];
  if (!p) throw new MailboxError('Unknown email provider', 400, 'BAD_PROVIDER');
  return p;
};
const isConfigured = (name) => Boolean(PROVIDERS[name]?.clientId() && PROVIDERS[name]?.clientSecret());
const availability = () => Object.fromEntries(Object.keys(PROVIDERS).map((name) => [name, isConfigured(name)]));
const redirectUri = (name) => {
  const base = (process.env.OAUTH_REDIRECT_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');
  return `${base}/api/oauth/mail/${name}/callback`;
};
const safeReturnTo = (path) => (typeof path === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(path) ? path : null);
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Builds the Google/Microsoft sign-in URL for this admin (PKCE + signed, single-use state). */
function startAuthorization({ provider: name, userId, returnTo, withRead = false }) {
  const p = providerOf(name);
  if (!isConfigured(name)) {
    throw new MailboxError(`${p.label} sign-in is not set up on the server yet. Ask your administrator to add the ${p.label} OAuth client ID and secret.`, 503, 'OAUTH_NOT_CONFIGURED');
  }
  const now = Date.now();
  for (const [key, value] of pending) if (value.expires < now) pending.delete(key);
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  pending.set(nonce, { userId, provider: name, verifier, returnTo: safeReturnTo(returnTo), expires: now + STATE_TTL_MS });
  const scope = withRead && p.readScope ? `${p.scope} ${p.readScope}` : p.scope;
  const state = jwt.sign({ n: nonce, p: name, purpose: 'mailbox-connect' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: p.clientId(),
    redirect_uri: redirectUri(name),
    response_type: 'code',
    scope,
    state,
    code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    ...p.extraAuthParams
  });
  return `${p.authUrl()}?${params.toString()}`;
}

async function tokenRequest(p, body) {
  const res = await fetch(p.tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: p.clientId(), client_secret: p.clientSecret(), ...body }).toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new MailboxError(data.error_description || data.error || `Token request failed (${res.status})`, 502, data.error === 'invalid_grant' ? 'RECONNECT' : 'OAUTH_TOKEN_FAILED');
    err.oauthError = data.error;
    throw err;
  }
  return data;
}

async function accountEmail(name, accessToken) {
  if (name === 'google') {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.email) throw new MailboxError('Could not read your Google account email', 502, 'OAUTH_PROFILE_FAILED');
    if (data.email_verified === false) throw new MailboxError('Your Google email address is not verified', 403, 'OAUTH_UNVERIFIED');
    const email = String(data.email).toLowerCase();
    return { email, addresses: [email], name: data.name || null };
  }
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName,proxyAddresses', { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json().catch(() => ({}));
  const email = data.mail || data.userPrincipalName;
  if (!res.ok || !email) throw new MailboxError('Could not read your Microsoft account email', 502, 'OAUTH_PROFILE_FAILED');
  // Every address of this mailbox: primary, sign-in name and aliases ("smtp:alias@domain").
  const aliases = (Array.isArray(data.proxyAddresses) ? data.proxyAddresses : [])
    .filter((a) => /^smtp:/i.test(a)).map((a) => a.slice(5));
  const addresses = [...new Set([email, data.userPrincipalName, ...aliases].filter(Boolean).map((a) => String(a).toLowerCase()))];
  return { email: String(email).toLowerCase(), addresses, name: data.displayName || null };
}

/**
 * Completes the connection after the provider redirects back.
 * @returns {Promise<{ account, returnTo: string|null }>}
 */
async function completeAuthorization({ provider: name, code, state, error, errorDescription }) {
  let claims;
  try {
    claims = jwt.verify(String(state || ''), process.env.JWT_SECRET);
  } catch (_) {
    throw new MailboxError('This sign-in link has expired. Click Connect again.', 400, 'OAUTH_STATE_INVALID');
  }
  const entry = claims.purpose === 'mailbox-connect' && claims.p === name ? pending.get(claims.n) : null;
  pending.delete(claims.n); // single use, even on failure
  if (!entry || entry.expires < Date.now()) throw new MailboxError('This sign-in link has expired. Click Connect again.', 400, 'OAUTH_STATE_INVALID');
  const fail = (message, codeName) => { const e = new MailboxError(message, 400, codeName); e.returnTo = entry.returnTo; return e; };
  if (error) throw fail(error === 'access_denied' ? 'You cancelled the sign-in, so your mailbox was not connected.' : (errorDescription || error), 'OAUTH_DENIED');
  if (!code) throw fail('The sign-in did not return an authorization code.', 'OAUTH_NO_CODE');

  const p = providerOf(name);
  let tokens;
  try {
    tokens = await tokenRequest(p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(name), code_verifier: entry.verifier });
  } catch (e) {
    throw fail(`Could not complete the ${p.label} sign-in: ${e.message}`, 'OAUTH_TOKEN_FAILED');
  }
  if (!tokens.refresh_token) throw fail(`${p.label} did not grant offline access. Remove LedgerLine from your account's connected apps and connect again.`, 'OAUTH_NO_REFRESH');
  const scopes = String(tokens.scope || '');
  if (name === 'google' && !scopes.includes('gmail.send')) throw fail('Permission to send email was not granted. Connect again and allow "Send email on your behalf".', 'OAUTH_SCOPE');
  if (name === 'microsoft' && scopes && !/mail\.send/i.test(scopes)) throw fail('Permission to send email was not granted. Connect again and accept the Mail.Send permission.', 'OAUTH_SCOPE');

  const profile = await accountEmail(name, tokens.access_token).catch((e) => { throw fail(e.message, e.code); });
  const user = await User.findByPk(entry.userId, { attributes: ['id', 'email', 'first_name', 'last_name', 'client_id'] });
  if (!user) throw fail('Your LedgerLine account was not found.', 'OAUTH_NO_USER');
  // The mailbox must be the admin's own: their login email is its primary address or one of its aliases.
  if (!profile.addresses.includes(String(user.email || '').toLowerCase())) {
    throw fail(`You signed in as ${profile.email}, but your LedgerLine login is ${user.email}. Vendor emails must come from your own mailbox, so sign in with ${user.email}.`, 'OAUTH_EMAIL_MISMATCH');
  }

  const values = {
    user_id: user.id,
    client_id: user.client_id || null,
    provider: p.code,
    smtp_host: null, smtp_port: null, smtp_secure: false, smtp_user: null, password_enc: null,
    oauth_refresh_enc: encryptSecret(tokens.refresh_token),
    oauth_access_enc: encryptSecret(tokens.access_token),
    oauth_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000),
    oauth_scopes: tokens.scope || null,
    from_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || profile.name,
    from_email: profile.email,
    verified_at: new Date(),
    last_error: null
  };
  const existing = await UserMailAccount.findOne({ where: { user_id: user.id } });
  const account = existing ? await existing.update(values) : await UserMailAccount.create(values);
  return { account, returnTo: entry.returnTo, userId: user.id };
}

/** Scopes to request on renewal: what the provider granted last time, plus offline_access. */
const grantedScope = (account, p) => {
  const granted = String(account.oauth_scopes || '').split(/\s+/).filter(Boolean);
  if (!granted.length) return p.scope;
  return [...new Set([...granted, 'offline_access'])].join(' ');
};

/** Valid access token for an OAuth mailbox, refreshing (and re-saving) it when needed. */
async function accessTokenFor(account) {
  if (account.oauth_access_enc && account.oauth_expires_at && new Date(account.oauth_expires_at).getTime() - Date.now() > 60000) {
    return decryptSecret(account.oauth_access_enc);
  }
  const name = CODE_FOR[account.provider];
  const p = providerOf(name);
  if (!isConfigured(name)) throw new MailboxError(`${p.label} sign-in is no longer set up on the server.`, 503, 'OAUTH_NOT_CONFIGURED');
  try {
    const tokens = await tokenRequest(p, {
      grant_type: 'refresh_token',
      refresh_token: decryptSecret(account.oauth_refresh_enc),
      // Ask only for what was actually granted; requesting an unapproved permission makes Microsoft
      // refuse the whole renewal (AADSTS65001).
      ...(name === 'microsoft' ? { scope: grantedScope(account, p) } : {})
    });
    await account.update({
      oauth_access_enc: encryptSecret(tokens.access_token),
      oauth_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000),
      ...(tokens.scope ? { oauth_scopes: tokens.scope } : {}),
      ...(tokens.refresh_token ? { oauth_refresh_enc: encryptSecret(tokens.refresh_token) } : {})
    });
    return tokens.access_token;
  } catch (e) {
    if (e.code === 'RECONNECT') {
      throw new MailboxError(`Your ${p.label} connection has expired or was revoked. Open Settings → Email account and connect again.`, 409, 'RECONNECT');
    }
    throw e;
  }
}

const composeMime = (message) => new Promise((resolve, reject) => {
  const mail = new MailComposer(message).compile();
  mail.build((err, buffer) => (err ? reject(err) : resolve({ buffer, messageId: mail.messageId() })));
});

/** Sends one message through the Gmail API or Microsoft Graph as the connected user. */
async function sendViaProvider(account, { from, to, cc, subject, html, text, attachments = [] }) {
  const token = await accessTokenFor(account);
  // Gmail and Graph both deliver to every To/Cc address in the MIME headers.
  const { buffer, messageId } = await composeMime({ from, to, cc, subject, html, text, attachments });
  if (account.provider === 'GOOGLE') {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: b64url(buffer) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new MailboxError(`Gmail refused the message: ${data.error?.message || res.status}`, 502, res.status === 401 ? 'RECONNECT' : 'SEND_FAILED');
    return { messageId: data.id || messageId };
  }
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: buffer.toString('base64')
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new MailboxError(`Outlook refused the message: ${data.error?.message || res.status}`, 502, res.status === 401 ? 'RECONNECT' : 'SEND_FAILED');
  }
  return { messageId };
}

module.exports = { availability, startAuthorization, completeAuthorization, sendViaProvider, accessTokenFor, redirectUri, PROVIDERS };
