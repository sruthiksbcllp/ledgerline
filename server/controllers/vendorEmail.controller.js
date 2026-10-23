'use strict';

const { UserMailAccount, VendorEmailDraft, Vendor, User } = require('../models');
const { buildAdminWhere } = require('../utils/tenantFilter');
const { recordAudit, documentHistory } = require('../utils/financeAudit');
const { encryptSecret, verifyMailbox, publicAccount, MailboxError } = require('../services/userMailbox.service');
const { prepareDraft, approveAndSend, renderEmail, VendorEmailError } = require('../services/vendorEmail.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fail = (res, error) => {
  if (error instanceof VendorEmailError || error instanceof MailboxError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  }
  console.error('[vendor-email]', error.message);
  return res.status(500).json({ success: false, message: 'Something went wrong with the vendor email' });
};
const audit = (req, draft, action, note, before = null) => recordAudit(req, {
  module: 'RFQ', entityType: 'VENDOR_EMAIL', entityId: draft.id, action, before, after: draft, note
});

// ── Admin's own mailbox ─────────────────────────────────────────────────────
exports.getMailbox = async (req, res) => {
  const [account, me] = await Promise.all([
    UserMailAccount.findOne({ where: { user_id: req.user.id } }),
    User.findByPk(req.user.id, { attributes: ['email', 'first_name', 'last_name'] })
  ]);
  // `me`: the login email the mailbox must match, for pre-filling the connect forms.
  return res.json({
    success: true,
    data: publicAccount(account),
    me: me ? { email: me.email, name: `${me.first_name || ''} ${me.last_name || ''}`.trim() } : null
  });
};

exports.saveMailbox = async (req, res) => {
  try {
    const b = req.body || {};
    const settings = {
      smtp_host: String(b.smtp_host || '').trim(),
      smtp_port: Number(b.smtp_port),
      smtp_secure: Boolean(b.smtp_secure),
      smtp_user: String(b.smtp_user || '').trim(),
      from_name: String(b.from_name || '').trim() || null,
      from_email: String(b.from_email || '').trim().toLowerCase()
    };
    if (!settings.smtp_host || !Number.isInteger(settings.smtp_port) || settings.smtp_port < 1 || settings.smtp_port > 65535) {
      return res.status(400).json({ success: false, message: 'Enter the SMTP host and a valid port' });
    }
    if (!settings.smtp_user) return res.status(400).json({ success: false, message: 'Enter the SMTP username' });
    if (!EMAIL_RE.test(settings.from_email)) return res.status(400).json({ success: false, message: 'Enter a valid sender email address' });
    const me = await User.findByPk(req.user.id, { attributes: ['email'] });
    if (me?.email && settings.from_email !== String(me.email).toLowerCase()) {
      return res.status(400).json({ success: false, message: `The sender address must be your own email (${me.email})` });
    }

    const existing = await UserMailAccount.findOne({ where: { user_id: req.user.id } });
    const password = b.password ? String(b.password) : null;
    const hasSavedPassword = existing && existing.provider === 'SMTP' && existing.password_enc;
    if (!password && !hasSavedPassword) return res.status(400).json({ success: false, message: 'Enter the mailbox password or app password' });
    const { decryptSecret } = require('../services/userMailbox.service');
    const plain = password || decryptSecret(existing.password_enc);
    await verifyMailbox(settings, plain); // only working credentials are saved
    const values = {
      ...settings, provider: 'SMTP', user_id: req.user.id, client_id: req.user.client_id || null,
      password_enc: password ? encryptSecret(password) : existing.password_enc,
      oauth_refresh_enc: null, oauth_access_enc: null, oauth_expires_at: null,
      verified_at: new Date(), last_error: null
    };
    const account = existing ? await existing.update(values) : await UserMailAccount.create(values);
    await recordAudit(req, { module: 'RFQ', entityType: 'USER_MAILBOX', entityId: account.id, action: 'MAILBOX_CONNECTED', note: `${settings.from_email} via ${settings.smtp_host}:${settings.smtp_port}` });
    return res.json({ success: true, message: 'Mailbox connected and verified', data: publicAccount(account) });
  } catch (error) {
    return fail(res, error);
  }
};

// ── One-click Google / Microsoft connection ─────────────────────────────────
exports.oauthProviders = async (_req, res) => {
  const { availability } = require('../services/mailOAuth.service');
  return res.json({ success: true, data: availability() });
};

exports.oauthStart = async (req, res) => {
  try {
    const { startAuthorization } = require('../services/mailOAuth.service');
    // ?read=1 also asks for permission to read vendor replies (may need the organisation's admin approval).
    const url = startAuthorization({ provider: req.params.provider, userId: req.user.id, returnTo: req.query.return_to, withRead: req.query.read === '1' });
    return res.json({ success: true, data: { url } });
  } catch (error) {
    return fail(res, error);
  }
};

/** Public: Google/Microsoft redirect the browser here after sign-in. Identifies the admin by the signed state. */
exports.oauthCallback = async (req, res) => {
  const { completeAuthorization } = require('../services/mailOAuth.service');
  // CLIENT_URL may list several origins (comma-separated); the first is the app itself.
  const clientUrl = String(process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, '');
  const back = (params) => res.redirect(`${clientUrl}/settings/email-account?${new URLSearchParams(params).toString()}`);
  try {
    const { account, returnTo, userId } = await completeAuthorization({
      provider: req.params.provider,
      code: req.query.code,
      state: req.query.state,
      error: req.query.error,
      errorDescription: req.query.error_description
    });
    await recordAudit({ user: { id: userId, client_id: account.client_id }, ip: req.ip, headers: req.headers }, {
      module: 'RFQ', entityType: 'USER_MAILBOX', entityId: account.id, action: 'MAILBOX_CONNECTED', note: `${account.from_email} via ${account.provider} sign-in`
    });
    return back({ mail_connected: account.provider.toLowerCase(), ...(returnTo ? { return_to: returnTo } : {}) });
  } catch (error) {
    return back({ mail_error: String(error.message || 'Could not connect the mailbox').slice(0, 300), ...(error.returnTo ? { return_to: error.returnTo } : {}) });
  }
};

exports.testMailbox = async (req, res) => {
  try {
    const { sendFromMailbox } = require('../services/userMailbox.service');
    const account = await UserMailAccount.findOne({ where: { user_id: req.user.id } });
    if (!account) return res.status(412).json({ success: false, code: 'NO_MAILBOX', message: 'Connect your email account first' });
    const result = await sendFromMailbox(account, {
      to: account.from_email,
      subject: 'LedgerLine test email',
      html: '<p>This is a test from LedgerLine. Your mailbox is connected: RFQs and vendor emails you send will come from this address.</p>',
      text: 'This is a test from LedgerLine. Your mailbox is connected: RFQs and vendor emails you send will come from this address.'
    });
    await account.update({ last_error: null });
    return res.json({ success: true, message: `Test email sent to ${account.from_email}`, data: { message_id: result.messageId } });
  } catch (error) {
    const account = await UserMailAccount.findOne({ where: { user_id: req.user.id } }).catch(() => null);
    if (account) await account.update({ last_error: String(error.message || error).slice(0, 500) }).catch(() => {});
    return fail(res, error);
  }
};

exports.deleteMailbox = async (req, res) => {
  const account = await UserMailAccount.findOne({ where: { user_id: req.user.id } });
  if (account) {
    await account.destroy();
    await recordAudit(req, { module: 'RFQ', entityType: 'USER_MAILBOX', entityId: account.id, action: 'MAILBOX_DISCONNECTED', note: account.from_email });
  }
  return res.json({ success: true, message: 'Mailbox disconnected' });
};

// ── Drafts ──────────────────────────────────────────────────────────────────
const view = async (req, draft) => {
  const tenantWhere = buildAdminWhere(req);
  const [vendor, mailbox, history] = await Promise.all([
    Vendor.findByPk(draft.vendor_id, { attributes: ['id', 'vendor_name', 'email', 'contact_person'] }),
    UserMailAccount.findOne({ where: { user_id: req.user.id } }),
    documentHistory(tenantWhere, 'VENDOR_EMAIL', draft.id)
  ]);
  const j = draft.toJSON();
  const rendered = renderEmail({ subject: j.subject, message: j.message, details: j.details });
  return {
    ...j,
    vendor: vendor && vendor.toJSON(),
    to_email: j.status === 'SENT' ? j.to_email : (vendor?.email || null), // always the registered email
    html: rendered.html,
    my_mailbox: publicAccount(mailbox),
    history
  };
};

exports.list = async (req, res) => {
  const where = { ...buildAdminWhere(req) };
  if (req.query.rfq_id) where.rfq_id = Number(req.query.rfq_id);
  if (req.query.quotation_id) where.quotation_id = Number(req.query.quotation_id);
  const rows = await VendorEmailDraft.findAll({
    where,
    attributes: { exclude: ['details', 'message'] },
    include: [{ model: Vendor, attributes: ['id', 'vendor_name', 'email'] }],
    order: [['id', 'DESC']],
    limit: 500
  });
  return res.json({ success: true, data: rows });
};

exports.detail = async (req, res) => {
  const draft = await VendorEmailDraft.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!draft) return res.status(404).json({ success: false, message: 'Email draft not found' });
  return res.json({ success: true, data: await view(req, draft) });
};

exports.prepare = async (req, res) => {
  try {
    const quotationId = Number(req.body?.quotation_id);
    if (!quotationId) return res.status(400).json({ success: false, message: 'quotation_id is required' });
    const clientId = buildAdminWhere(req).client_id || null;
    const result = await prepareDraft({ quotationId, clientId, userId: req.user.id });
    if (result.created) await audit(req, result.draft, 'VENDOR_EMAIL_DRAFTED', `${result.draft.email_type === 'PO_CONFIRMATION' ? 'PO confirmation' : 'RFQ award'} email prepared for review`);
    const message = result.already_sent
      ? 'This email was already sent'
      : (result.created ? 'Email draft prepared for review' : 'Existing email draft opened');
    return res.status(result.created ? 201 : 200).json({ success: true, message, data: await view(req, result.draft), already_sent: result.already_sent });
  } catch (error) {
    return fail(res, error);
  }
};

exports.update = async (req, res) => {
  const draft = await VendorEmailDraft.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!draft) return res.status(404).json({ success: false, message: 'Email draft not found' });
  if (!['DRAFT', 'FAILED'].includes(draft.status)) return res.status(409).json({ success: false, message: `A ${draft.status.toLowerCase()} email can no longer be edited` });
  const subject = String(req.body?.subject ?? draft.subject).trim();
  const message = String(req.body?.message ?? draft.message).trim();
  if (!subject || subject.length > 255) return res.status(400).json({ success: false, message: 'Subject is required (max 255 characters)' });
  if (!message || message.length > 20000) return res.status(400).json({ success: false, message: 'Message is required (max 20,000 characters)' });
  const before = draft.toJSON();
  await draft.update({ subject, message, edited_by: req.user.id, edited_at: new Date() });
  await audit(req, draft, 'VENDOR_EMAIL_EDITED', 'Subject or message edited', before);
  return res.json({ success: true, message: 'Draft saved', data: await view(req, draft) });
};

exports.send = async (req, res) => {
  try {
    const result = await approveAndSend({ draftId: Number(req.params.id), tenantWhere: buildAdminWhere(req), userId: req.user.id });
    await audit(req, result.draft, 'VENDOR_EMAIL_SENT', `Approved and sent from ${result.from} to ${result.to}, cc ${result.from}`);
    return res.json({ success: true, message: `Email sent to ${result.to}`, data: await view(req, result.draft) });
  } catch (error) {
    const draft = await VendorEmailDraft.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } }).catch(() => null);
    if (draft && error.code === 'SEND_FAILED') await audit(req, draft, 'VENDOR_EMAIL_FAILED', error.message);
    return fail(res, error);
  }
};

exports.cancel = async (req, res) => {
  const draft = await VendorEmailDraft.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!draft) return res.status(404).json({ success: false, message: 'Email draft not found' });
  if (!['DRAFT', 'FAILED'].includes(draft.status)) return res.status(409).json({ success: false, message: `A ${draft.status.toLowerCase()} email cannot be cancelled` });
  const before = draft.toJSON();
  // Releasing the dedupe key lets a fresh draft be prepared later if needed.
  await draft.update({ status: 'CANCELLED', dedupe_key: null });
  await audit(req, draft, 'VENDOR_EMAIL_CANCELLED', String(req.body?.reason || 'Cancelled by admin').slice(0, 300), before);
  return res.json({ success: true, message: 'Email cancelled; nothing was sent', data: await view(req, draft) });
};
