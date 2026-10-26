'use strict';

/**
 * Shared helpers for Settings → Integrations: the error type, secret encryption and
 * server-side HTTP calls to the connected apps. Nothing here is ever sent to the browser.
 */
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

class IntegrationError extends Error {
  constructor(message, status = 400, code = 'INTEGRATION_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// AES-256-GCM, same format as saved mailbox passwords. A dedicated key can be set so the two can be
// rotated independently; otherwise the mailbox key is reused.
const key = () => {
  const hex = String(process.env.INTEGRATION_CREDENTIALS_KEY || process.env.MAIL_CREDENTIALS_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new IntegrationError('Secure credential storage is not set up on the server (INTEGRATION_CREDENTIALS_KEY).', 503, 'CREDENTIALS_KEY_MISSING');
  }
  return Buffer.from(hex, 'hex');
};
const isStorageReady = () => {
  try { key(); return true; } catch (_) { return false; }
};

/** "v1:<iv>:<tag>:<ciphertext>" (base64 parts). */
const encryptSecret = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
};

const decryptSecret = (stored) => {
  if (!stored) return null;
  const [version, iv, tag, data] = String(stored).split(':');
  try {
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('bad format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    if (e instanceof IntegrationError) throw e;
    throw new IntegrationError('Saved credentials could not be decrypted (the server key changed). Disconnect and connect again.', 409, 'CREDENTIALS_UNREADABLE');
  }
};

const encryptJson = (obj) => (obj && Object.keys(obj).length ? encryptSecret(JSON.stringify(obj)) : null);
const decryptJson = (stored) => (stored ? JSON.parse(decryptSecret(stored)) : {});

// ── Outbound URL safety ──────────────────────────────────────────────────────
// Admin-entered URLs (Tally, SAP, GSP) are called from the server, so they must not point at the
// server's own network. Cloud metadata / link-local addresses are always refused; loopback and
// private ranges only when INTEGRATIONS_ALLOW_PRIVATE_URLS=true (self-hosted / VPN) or outside production.
const v4Parts = (ip) => ip.split('.').map(Number);
const classify = (ip) => {
  let addr = ip;
  // IPv4-mapped IPv6, dotted (::ffff:127.0.0.1) or hex as URL() writes it (::ffff:7f00:1)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(addr);
  if (mapped) addr = mapped[1];
  else if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    addr = [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
  }
  if (net.isIPv4(addr)) {
    const [a, b] = v4Parts(addr);
    if (a === 169 && b === 254) return 'link-local';
    if (a === 0) return 'unspecified';
    if (a === 127) return 'loopback';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private';
    return 'public';
  }
  const lower = addr.toLowerCase();
  if (lower === '::') return 'unspecified';
  if (lower === '::1') return 'loopback';
  if (/^fe[89ab]/.test(lower)) return 'link-local';
  if (/^f[cd]/.test(lower)) return 'private';
  return 'public';
};
const allowPrivate = () => process.env.INTEGRATIONS_ALLOW_PRIVATE_URLS === 'true' || process.env.NODE_ENV !== 'production';

/** Parses an admin-entered URL and refuses addresses the server must not call. */
async function assertSafeUrl(raw, { httpsOnly = false, label = 'URL' } = {}) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch (_) {
    throw new IntegrationError(`${label} is not a valid URL`, 400, 'BAD_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new IntegrationError(`${label} must start with http:// or https://`, 400, 'BAD_URL');
  if (httpsOnly && url.protocol !== 'https:') throw new IntegrationError(`${label} must use https://`, 400, 'BAD_URL');
  if (url.username || url.password) throw new IntegrationError(`${label} must not contain a username or password`, 400, 'BAD_URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch (_) {
    throw new IntegrationError(`${label}: the host "${host}" could not be found`, 400, 'HOST_NOT_FOUND');
  }
  for (const { address } of addresses) {
    const kind = classify(address);
    if (kind === 'link-local' || kind === 'unspecified') throw new IntegrationError(`${label} points to a reserved network address`, 400, 'URL_NOT_ALLOWED');
    if ((kind === 'loopback' || kind === 'private') && !allowPrivate()) {
      throw new IntegrationError(`${label} points to a private network address. Expose the service on a public address (or VPN with INTEGRATIONS_ALLOW_PRIVATE_URLS=true).`, 400, 'URL_NOT_ALLOWED');
    }
  }
  return url;
}

/**
 * Server-side HTTP call with a timeout. Redirects are not followed (a redirect could lead to an
 * address that was not checked). Returns { status, ok, body, text }.
 */
async function httpRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    throw new IntegrationError(timedOut ? 'The service did not respond in time' : `Could not reach the service (${e?.cause?.code || e.message})`, 502, timedOut ? 'TIMEOUT' : 'UNREACHABLE');
  }
  const text = await res.text().catch(() => '');
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = null; }
  return { status: res.status, ok: res.ok, body: parsed, text };
}

const basicAuth = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

module.exports = {
  IntegrationError, encryptSecret, decryptSecret, encryptJson, decryptJson, isStorageReady,
  assertSafeUrl, httpRequest, basicAuth, b64url
};
