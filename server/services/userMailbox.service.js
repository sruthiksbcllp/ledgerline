'use strict';

/**
 * Each admin's own SMTP mailbox for sending vendor emails as themselves.
 * Passwords are encrypted at rest with AES-256-GCM using MAIL_CREDENTIALS_KEY (.env)
 * and are only decrypted in memory to open an SMTP connection.
 */
const crypto = require('crypto');
const nodemailer = require('nodemailer');

class MailboxError extends Error {
  constructor(message, status = 400, code = 'MAILBOX_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const key = () => {
  const hex = String(process.env.MAIL_CREDENTIALS_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new MailboxError('Mailbox storage is not configured on the server (MAIL_CREDENTIALS_KEY).', 503, 'MAIL_KEY_MISSING');
  }
  return Buffer.from(hex, 'hex');
};

/** "v1:<iv>:<tag>:<ciphertext>" (base64 parts). */
const encryptSecret = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
};

const decryptSecret = (stored) => {
  const [version, iv, tag, data] = String(stored || '').split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new MailboxError('Saved mailbox password is unreadable. Reconnect your mailbox.', 409, 'MAILBOX_CORRUPT');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch (_) {
    throw new MailboxError('Saved mailbox password could not be decrypted (the server key changed). Reconnect your mailbox.', 409, 'MAILBOX_CORRUPT');
  }
};

const transportFor = ({ smtp_host, smtp_port, smtp_secure, smtp_user }, password) => nodemailer.createTransport({
  host: smtp_host,
  port: Number(smtp_port),
  secure: Boolean(smtp_secure),
  auth: { user: smtp_user, pass: password },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
  // Refuse to send credentials over an unencrypted connection to a remote server.
  requireTLS: !smtp_secure && !['localhost', '127.0.0.1'].includes(String(smtp_host).toLowerCase())
});

/** Human-readable reason from a nodemailer/SMTP error, without echoing credentials. */
const smtpReason = (error) => {
  const code = error?.code || '';
  if (code === 'EAUTH') return 'The mail server rejected the username or password (for Gmail/Outlook use an app password).';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(code)) return `Could not connect to the mail server (${code}). Check host, port and security setting.`;
  if (code === 'EENVELOPE') return 'The mail server refused the sender or recipient address.';
  return String(error?.response || error?.message || 'Unknown mail server error').slice(0, 300);
};

async function verifyMailbox(settings, password) {
  try {
    await transportFor(settings, password).verify();
  } catch (error) {
    throw new MailboxError(smtpReason(error), 422, 'MAILBOX_VERIFY_FAILED');
  }
}

/**
 * Sends one message through the admin's own mailbox.
 * @returns {Promise<{ messageId: string, from: string }>}
 */
async function sendFromMailbox(account, { to, cc, subject, html, text, attachments = [] }) {
  // Never copy someone on a message they are already the recipient of.
  const ccList = (Array.isArray(cc) ? cc : [cc]).filter(Boolean).map((a) => String(a).trim().toLowerCase())
    .filter((a, i, all) => a && a !== String(to).trim().toLowerCase() && all.indexOf(a) === i);
  cc = ccList.length ? ccList : undefined;
  const from = account.from_name ? `"${account.from_name.replace(/"/g, '')}" <${account.from_email}>` : account.from_email;
  if (account.provider && account.provider !== 'SMTP') {
    // One-click Google / Microsoft connection: send through their API with an OAuth token.
    const { sendViaProvider } = require('./mailOAuth.service');
    const result = await sendViaProvider(account, { from, to, cc, subject, html, text, attachments });
    return { messageId: result.messageId, from };
  }
  const password = decryptSecret(account.password_enc);
  try {
    const info = await transportFor(account, password).sendMail({ from, to, cc, subject, html, text, attachments });
    return { messageId: info.messageId, from };
  } catch (error) {
    throw new MailboxError(smtpReason(error), 502, 'SEND_FAILED');
  }
}

const publicAccount = (a) => a && ({
  provider: a.provider || 'SMTP',
  smtp_host: a.smtp_host,
  smtp_port: a.smtp_port,
  smtp_secure: a.smtp_secure,
  smtp_user: a.smtp_user,
  from_name: a.from_name,
  from_email: a.from_email,
  verified_at: a.verified_at,
  last_error: a.last_error,
  has_password: Boolean(a.password_enc),
  // Outlook connections approved with Mail.Read can show vendor replies inside LedgerLine.
  can_read_mail: a.provider === 'MICROSOFT' && String(a.oauth_scopes || '').toLowerCase().split(/\s+/).includes('mail.read'),
  connected_at: a.verified_at
});

module.exports = { MailboxError, encryptSecret, decryptSecret, verifyMailbox, sendFromMailbox, publicAccount };
