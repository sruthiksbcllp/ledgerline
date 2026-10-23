'use strict';

/**
 * Vendor replies to RFQs, read from the admin's connected Outlook mailbox (Microsoft Graph,
 * delegated Mail.Read). Only messages that mention the RFQ number AND were sent by one of
 * that RFQ's vendors are ever listed or opened; nothing else in the mailbox is exposed.
 */
const { UserMailAccount } = require('../models');
const { MailboxError } = require('./userMailbox.service');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const lower = (v) => String(v || '').trim().toLowerCase();

async function mailboxFor(userId) {
  const account = await UserMailAccount.findOne({ where: { user_id: userId } });
  if (!account) throw new MailboxError('Connect your Outlook in Settings → Email account to see vendor replies.', 412, 'NO_MAILBOX');
  if (account.provider !== 'MICROSOFT') {
    throw new MailboxError('Reading vendor replies works with an Outlook connection. Connect Outlook in Settings → Email account.', 409, 'NOT_OUTLOOK');
  }
  const scopes = lower(account.oauth_scopes).split(/\s+/);
  if (!scopes.includes('mail.read')) {
    throw new MailboxError('Allow LedgerLine to read vendor replies (Outlook "Read your mail" permission). Your organisation may need to approve it first; sending is not affected.', 409, 'NEEDS_MAIL_READ');
  }
  return account;
}

async function graph(account, path, { raw = false } = {}) {
  const { accessTokenFor } = require('./mailOAuth.service');
  const token = await accessTokenFor(account);
  const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' } });
  if (res.status === 401 || res.status === 403) {
    throw new MailboxError('Outlook did not allow reading your mail. Reconnect Outlook in Settings → Email account.', 409, 'NEEDS_MAIL_READ');
  }
  if (res.status === 404) throw new MailboxError('That email is no longer in your mailbox.', 404, 'NOT_FOUND');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new MailboxError(`Outlook error: ${data.error?.message || res.status}`, 502, 'GRAPH_ERROR');
  }
  return raw ? res : res.json();
}

const vendorEmailsOf = (rfq) => new Map((rfq.vendors || [])
  .filter((rv) => rv.vendor && rv.vendor.email)
  .map((rv) => [lower(rv.vendor.email), { vendor_id: rv.vendor_id, vendor_name: rv.vendor.vendor_name }]));

const mentionsRfq = (msg, rfqNumber) => {
  const n = lower(rfqNumber);
  return lower(msg.subject).includes(n) || lower(msg.bodyPreview).includes(n) || lower(msg.body?.content).includes(n);
};

/** Replies from this RFQ's vendors, newest first, grouped by vendor_id. */
async function listReplies({ rfq, userId }) {
  const account = await mailboxFor(userId);
  const vendors = vendorEmailsOf(rfq);
  if (!vendors.size) return { mailbox: account.from_email, replies: [] };
  const search = encodeURIComponent(`"${rfq.rfq_number}"`);
  const select = 'id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead,webLink';
  const data = await graph(account, `/me/messages?$search=${search}&$select=${select}&$top=50`);
  const replies = (data.value || [])
    .map((m) => ({ ...m, fromAddress: lower(m.from?.emailAddress?.address) }))
    .filter((m) => vendors.has(m.fromAddress) && m.fromAddress !== lower(account.from_email) && mentionsRfq(m, rfq.rfq_number))
    .sort((a, b) => new Date(b.receivedDateTime) - new Date(a.receivedDateTime))
    .map((m) => ({
      id: m.id,
      vendor_id: vendors.get(m.fromAddress).vendor_id,
      vendor_name: vendors.get(m.fromAddress).vendor_name,
      from_name: m.from?.emailAddress?.name || null,
      from_email: m.fromAddress,
      subject: m.subject,
      received_at: m.receivedDateTime,
      preview: m.bodyPreview,
      has_attachments: Boolean(m.hasAttachments),
      is_read: Boolean(m.isRead),
      web_link: m.webLink || null
    }));
  return { mailbox: account.from_email, replies };
}

/** Loads one message, but only if it is a reply to this RFQ from one of its vendors. */
async function loadReply({ rfq, userId, messageId }) {
  const account = await mailboxFor(userId);
  const vendors = vendorEmailsOf(rfq);
  const id = encodeURIComponent(String(messageId || ''));
  const m = await graph(account, `/me/messages/${id}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,hasAttachments,webLink`);
  const fromAddress = lower(m.from?.emailAddress?.address);
  if (!vendors.has(fromAddress) || !mentionsRfq(m, rfq.rfq_number)) {
    throw new MailboxError('This email is not a vendor reply to this RFQ.', 403, 'NOT_A_REPLY');
  }
  return { account, message: m, vendor: vendors.get(fromAddress), fromAddress };
}

async function getReply({ rfq, userId, messageId }) {
  const { account, message: m, vendor, fromAddress } = await loadReply({ rfq, userId, messageId });
  let attachments = [];
  if (m.hasAttachments) {
    const att = await graph(account, `/me/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,size,isInline`);
    attachments = (att.value || [])
      .filter((a) => a['@odata.type'] === '#microsoft.graph.fileAttachment' && !a.isInline)
      .map((a) => ({ id: a.id, name: a.name, content_type: a.contentType, size: a.size }));
  }
  return {
    id: m.id,
    vendor_id: vendor.vendor_id,
    vendor_name: vendor.vendor_name,
    from_name: m.from?.emailAddress?.name || null,
    from_email: fromAddress,
    to: (m.toRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean),
    cc: (m.ccRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean),
    subject: m.subject,
    received_at: m.receivedDateTime,
    body_html: m.body?.contentType === 'html' ? m.body.content : null,
    body_text: m.body?.contentType === 'text' ? m.body.content : null,
    web_link: m.webLink || null,
    attachments
  };
}

/** Raw bytes of one attachment of a verified vendor reply. */
async function getAttachment({ rfq, userId, messageId, attachmentId }) {
  const { account, message } = await loadReply({ rfq, userId, messageId });
  const path = `/me/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(String(attachmentId || ''))}`;
  const meta = await graph(account, `${path}?$select=id,name,contentType,size`);
  const res = await graph(account, `${path}/$value`, { raw: true });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { name: meta.name || 'attachment', contentType: meta.contentType || 'application/octet-stream', buffer };
}

const QUOTE_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * What the AI should read for a reply: the attached quotation (first PDF/image up to 10 MB)
 * plus the email text, or the email text alone when nothing usable is attached.
 */
async function replySource({ rfq, userId, messageId }) {
  const { htmlToText } = require('./quotationExtraction.service');
  const reply = await getReply({ rfq, userId, messageId });
  const emailText = reply.body_text || htmlToText(reply.body_html);
  const candidate = reply.attachments.find((a) => QUOTE_FILE_TYPES.includes(String(a.content_type || '').toLowerCase()) && a.size <= 10 * 1024 * 1024);
  let file = null;
  if (candidate) {
    const att = await getAttachment({ rfq, userId, messageId: reply.id, attachmentId: candidate.id });
    file = { buffer: att.buffer, name: att.name };
  }
  return { reply, file, emailText };
}

/**
 * Replies still waiting for a quotation, across open RFQs: vendors who were sent the RFQ
 * (not yet RESPONDED) and have replied. `rfqs` must include vendors with their emails.
 */
async function listPendingReplies({ rfqs, userId }) {
  const results = [];
  for (const rfq of rfqs) {
    const waiting = (rfq.vendors || []).filter((rv) => rv.invite_status === 'SENT' && rv.vendor && rv.vendor.email);
    if (!waiting.length) continue;
    const { replies } = await listReplies({ rfq: { ...rfq.get({ plain: true }), vendors: waiting }, userId });
    replies.forEach((r) => results.push({ ...r, rfq_id: rfq.id, rfq_number: rfq.rfq_number, rfq_title: rfq.title }));
  }
  return results.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
}

module.exports = { listReplies, getReply, getAttachment, replySource, listPendingReplies };
