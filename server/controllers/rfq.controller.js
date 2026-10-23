'use strict';
/**
 * CR-P01 — RFQ + Multi-Vendor Sourcing controller.
 * Additive module. Reuses Quotation model for vendor responses. Tenant-scoped like createQuotation.
 * No approval-engine / tenancy-model / FT-006 change.
 */
const { Rfq, RfqItem, RfqVendor, Vendor, Entity, Company, PurchaseRequisition, PurchaseRequisitionItem, Quotation, QuotationItem, sequelize } = require('../models');
const { success } = require('../utils/responseHandler');
const AppError = require('../utils/appError');
const { getClientId, buildWhere } = require('../utils/tenantFilter');
const { recordTenantViolation } = require('../utils/securityEvents');
const { getNextNumber } = require('../services/documentNumbering');
const { Op } = require('sequelize');

const MAX_VENDORS = 5;

function fail(res, msg, code = 500) { return res.status(code).json({ success: false, message: msg }); }

// POST /api/rfqs — create RFQ (from a PR), select vendors, seed items
exports.createRfq = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { pr_id, title, due_date, remarks, vendor_ids = [], items = [] } = req.body;
    if (!Array.isArray(vendor_ids) || vendor_ids.length === 0) { await t.rollback(); return fail(res, 'Select at least one vendor', 400); }
    if (vendor_ids.length > MAX_VENDORS) { await t.rollback(); return fail(res, `A maximum of ${MAX_VENDORS} vendors can be selected per RFQ`, 400); }

    // Tenant derivation (mirror createQuotation): explicit client, else infer from a vendor
    let clientId = getClientId(req);
    const vendors = await Vendor.findAll({ where: { id: { [Op.in]: vendor_ids } } });
    if (vendors.length !== vendor_ids.length) { await t.rollback(); return fail(res, 'One or more vendors not found', 400); }
    if (!clientId) clientId = vendors[0] && vendors[0].client_id;
    if (!clientId) { await t.rollback(); return fail(res, 'Unable to determine tenant for RFQ', 400); }
    for (const v of vendors) {
      if (v.client_id && Number(v.client_id) !== Number(clientId)) { await t.rollback(); return fail(res, 'A selected vendor does not belong to your tenant', 403); }
    }

    // Optional PR linkage + tenant ownership (emit violation on mismatch)
    let prItems = [];
    let prNumber = null;
    if (pr_id) {
      const pr = await PurchaseRequisition.findByPk(pr_id);
      if (!pr) { await t.rollback(); return fail(res, 'Referenced PR not found', 400); }
      if (Number(pr.client_id) !== Number(clientId)) {
        recordTenantViolation({ user_id: req.user && req.user.id, actor_client_id: getClientId(req), target_model: 'PurchaseRequisition', target_id: pr.id, request_path: req.originalUrl, ip_address: req.ip, actor_role: req.user && req.user.role });
        await t.rollback(); return fail(res, 'Selected PR does not belong to your tenant', 403);
      }
      if (['REJECTED', 'CANCELLED'].includes(pr.status)) {
        await t.rollback(); return fail(res, `PR ${pr.pr_number} is ${pr.status.toLowerCase()} and cannot be sent for quotation`, 400);
      }
      prNumber = pr.pr_number;
      if (!items.length) prItems = await PurchaseRequisitionItem.findAll({ where: { requisition_id: pr_id } });
    }

    const rfq_number = await getNextNumber(clientId, 'RFQ', t);
    const rfq = await Rfq.create({
      client_id: clientId, rfq_number, pr_id: pr_id || null, title: title || (prNumber ? `RFQ for ${prNumber}` : (pr_id ? `RFQ for PR ${pr_id}` : 'RFQ')),
      due_date: due_date || null, remarks: remarks || null, status: 'DRAFT', created_by: req.user && req.user.id
    }, { transaction: t });

    const lineSource = items.length ? items : prItems.map(p => ({ item_name: p.item_name, description: p.description, quantity: p.quantity, unit: p.unit, category_id: p.category_id }));
    for (const it of lineSource) {
      await RfqItem.create({ rfq_id: rfq.id, client_id: clientId, item_name: it.item_name, description: it.description || null, quantity: Number(it.quantity || 0), unit: it.unit || null, category_id: it.category_id || null }, { transaction: t });
    }
    for (const vid of vendor_ids) {
      await RfqVendor.create({ rfq_id: rfq.id, vendor_id: vid, client_id: clientId, invite_status: 'PENDING' }, { transaction: t });
    }

    await t.commit();
    return success(res, { id: rfq.id, rfq_number: rfq.rfq_number }, 'RFQ created', 201);
  } catch (e) { await t.rollback(); return fail(res, e.message || 'Internal Server Error'); }
};

// GET /api/rfqs
exports.getRfqs = async (req, res) => {
  try {
    const where = buildWhere(req);
    const rfqs = await Rfq.findAll({ where, include: [{ model: RfqVendor, as: 'vendors' }], order: [['id', 'DESC']] });
    const prIds = [...new Set(rfqs.map(r => r.pr_id).filter(Boolean))];
    let prMap = {};
    if (prIds.length) {
      const prs = await PurchaseRequisition.findAll({ where: { id: prIds }, attributes: ['id', 'pr_number'] });
      prMap = Object.fromEntries(prs.map(p => [p.id, p.pr_number]));
    }
    const data = rfqs.map(r => { const plain = r.get({ plain: true }); plain.pr_number = r.pr_id ? (prMap[r.pr_id] || null) : null; return plain; });
    return success(res, data);
  } catch (e) { return fail(res, e.message); }
};

// GET /api/rfqs/:id
exports.getRfqById = async (req, res) => {
  try {
    const where = { id: req.params.id, ...buildWhere(req) };
    const rfq = await Rfq.findOne({
      where,
      include: [
        { model: RfqItem, as: 'items' },
        { model: RfqVendor, as: 'vendors', include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'email'] }, { model: Quotation, as: 'response', required: false, attributes: ['id', 'quotation_number', 'net_amount', 'status'] }] }
      ]
    });
    if (!rfq) return fail(res, 'RFQ not found', 404);
    return success(res, rfq);
  } catch (e) { return fail(res, e.message); }
};

// POST /api/rfqs/:id/send — email PENDING vendors
exports.sendRfq = async (req, res) => {
  try {
    const rfq = await Rfq.findOne({
      where: { id: req.params.id, ...buildWhere(req) },
      include: [
        { model: RfqVendor, as: 'vendors', include: [{ model: Vendor, as: 'vendor' }] },
        { model: RfqItem, as: 'items' }
      ]
    });
    if (!rfq) return fail(res, 'RFQ not found', 404);

    // Invitations go out from the logged-in user's own connected mailbox (see vendor-emails/mailbox).
    // A vendor is marked SENT only when the mail server accepted the message; failures stay PENDING
    // so clicking Send RFQ again retries just those vendors.
    const { UserMailAccount, User } = require('../models');
    const { sendFromMailbox, MailboxError } = require('../services/userMailbox.service');
    const { recordAudit } = require('../utils/financeAudit');
    const invite = require('../services/rfqInvite.service');
    // Default: pending vendors only. { resend: true } sends the same RFQ again to vendors it was
    // already sent to (optionally limited to { vendor_ids }); vendors who responded are never resent.
    const resend = Boolean(req.body && req.body.resend);
    const onlyIds = Array.isArray(req.body && req.body.vendor_ids) ? req.body.vendor_ids.map(Number) : null;
    const { chosen, targets, skipped } = invite.recipientsFor(rfq, { resend, onlyIds });
    if (!chosen.length) {
      return success(res, { sent: 0, failed: [], skipped: [] }, resend ? 'No vendor to resend to (only vendors already sent the RFQ can be resent)' : 'No pending vendors to send');
    }
    const account = await UserMailAccount.findOne({ where: { user_id: req.user.id } });
    if (!account) {
      return res.status(412).json({ success: false, code: 'NO_MAILBOX', message: 'RFQs are sent from your own email account. Connect your mailbox first (admins only).' });
    }
    const me = await User.findByPk(req.user.id, { attributes: ['first_name', 'last_name'] });
    const senderName = me ? `${me.first_name || ''} ${me.last_name || ''}`.trim() : '';
    const { buyerName, buyerGst } = await invite.buyerBranding(rfq);
    // The subject and message the admin reviewed (and possibly edited) in the preview.
    const content = invite.resolveContent({ rfq, buyerName, senderName, subject: req.body && req.body.subject, message: req.body && req.body.message });
    const edited = Boolean((req.body && req.body.message) || (req.body && req.body.subject));

    let sent = 0;
    const failed = [];
    for (const target of targets) {
      const html = invite.renderInvite({ rfq, buyerName, buyerGst, greetingName: target.greeting, message: content.message });
      try {
        // The sending admin is copied on every vendor's invitation.
        const result = await sendFromMailbox(account, { to: target.to, cc: account.from_email, subject: content.subject, html });
        await target.rv.update({ invite_status: 'SENT', email_sent_at: new Date() });
        sent += 1;
        await recordAudit(req, { module: 'RFQ', entityType: 'RFQ', entityId: rfq.id, action: 'RFQ_INVITE_SENT', after: { client_id: rfq.client_id, status: 'SENT' }, note: `${resend ? 'Resent' : 'Sent'} to ${target.vendor} <${target.to}> from ${result.from}, cc ${account.from_email}${edited ? ' (reviewed and edited before sending)' : ' (reviewed before sending)'}` });
      } catch (mailErr) {
        const reason = mailErr instanceof MailboxError ? mailErr.message : String(mailErr.message || mailErr).slice(0, 200);
        failed.push({ vendor_id: target.vendor_id, vendor: target.vendor, reason });
        await recordAudit(req, { module: 'RFQ', entityType: 'RFQ', entityId: rfq.id, action: 'RFQ_INVITE_FAILED', after: { client_id: rfq.client_id }, note: `${target.vendor} <${target.to}>: ${reason}` });
        if (mailErr instanceof MailboxError && ['MAILBOX_CORRUPT', 'MAIL_KEY_MISSING'].includes(mailErr.code)) break;
      }
    }
    if (failed.length) await account.update({ last_error: failed[failed.length - 1].reason }).catch(() => {});
    else if (sent) await account.update({ last_error: null }).catch(() => {});
    if (sent > 0 && rfq.status === 'DRAFT') await rfq.update({ status: 'SENT' });

    const parts = [];
    if (sent) parts.push(`RFQ ${resend ? 'resent' : 'emailed'} to ${sent} vendor${sent === 1 ? '' : 's'} from ${account.from_email}`);
    if (failed.length) parts.push(`${failed.length} failed`);
    if (skipped.length) parts.push(`${skipped.length} skipped (no email)`);
    const payload = { sent, failed, skipped, from: account.from_email };
    if (!sent && failed.length) return res.status(502).json({ success: false, message: `Could not send the RFQ: ${failed[0].reason}`, data: payload });
    if (!sent) return res.status(422).json({ success: false, message: 'No vendor has a valid registered email. Add emails in Vendor Master.', data: payload });
    return success(res, payload, parts.join(' · '));
  } catch (e) { return fail(res, e.message); }
};

// POST /api/rfqs/:id/email-preview — the exact email Send RFQ / Resend would send, for review.
// Body: { resend?, vendor_ids?, subject?, message?, preview_vendor_id? }. Sends nothing.
exports.rfqEmailPreview = async (req, res) => {
  try {
    const rfq = await Rfq.findOne({
      where: { id: req.params.id, ...buildWhere(req) },
      include: [
        { model: RfqVendor, as: 'vendors', include: [{ model: Vendor, as: 'vendor' }] },
        { model: RfqItem, as: 'items' }
      ]
    });
    if (!rfq) return fail(res, 'RFQ not found', 404);
    const { UserMailAccount, User } = require('../models');
    const invite = require('../services/rfqInvite.service');
    const resend = Boolean(req.body && req.body.resend);
    const onlyIds = Array.isArray(req.body && req.body.vendor_ids) ? req.body.vendor_ids.map(Number) : null;
    const { targets, skipped } = invite.recipientsFor(rfq, { resend, onlyIds });
    const [account, me] = await Promise.all([
      UserMailAccount.findOne({ where: { user_id: req.user.id } }),
      User.findByPk(req.user.id, { attributes: ['first_name', 'last_name'] })
    ]);
    const senderName = me ? `${me.first_name || ''} ${me.last_name || ''}`.trim() : '';
    const { buyerName, buyerGst } = await invite.buyerBranding(rfq);
    const content = invite.resolveContent({ rfq, buyerName, senderName, subject: req.body && req.body.subject, message: req.body && req.body.message });
    const previewTarget = targets.find((t) => Number(t.vendor_id) === Number(req.body && req.body.preview_vendor_id)) || targets[0];
    return success(res, {
      subject: content.subject,
      message: content.message,
      default_subject: invite.defaultSubject(rfq, buyerName),
      default_message: invite.defaultMessage(rfq, buyerName, senderName),
      rfq_number: rfq.rfq_number,
      from: account ? account.from_email : null,
      cc: account ? account.from_email : null,
      recipients: targets.map((t) => ({ vendor_id: t.vendor_id, vendor: t.vendor, email: t.to, greeting: t.greeting })),
      skipped,
      preview_vendor_id: previewTarget ? previewTarget.vendor_id : null,
      html: previewTarget ? invite.renderInvite({ rfq, buyerName, buyerGst, greetingName: previewTarget.greeting, message: content.message }) : null
    });
  } catch (e) { return fail(res, e.message); }
};

// POST /api/rfqs/:id/vendors/:vendorId/response — record a vendor quote -> Quotation
exports.recordResponse = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id, vendorId } = req.params;
    const { items = [], valid_until, currency = 'INR', discount_amount = 0, shipping_charges = 0, remarks, source_email } = req.body;
    const rfq = await Rfq.findOne({ where: { id, ...buildWhere(req) } });
    if (!rfq) { await t.rollback(); return fail(res, 'RFQ not found', 404); }
    const rv = await RfqVendor.findOne({ where: { rfq_id: id, vendor_id: vendorId } });
    if (!rv) { await t.rollback(); return fail(res, 'Vendor is not part of this RFQ', 400); }
    if (rv.invite_status === 'RESPONDED' && rv.response_quotation_id) {
      await t.rollback(); return fail(res, 'This vendor already has a quotation for this RFQ', 409);
    }
    if (!items.length) { await t.rollback(); return fail(res, 'At least one line item is required', 400); }

    const clientId = rfq.client_id;
    let total_amount = 0;
    let lineTax = 0;
    const qItems = items.map(it => {
      const qty = Number(it.quantity || 0), price = Number(it.unit_price || 0);
      const amount = Math.round(qty * price * 100) / 100;
      const taxPct = Number(it.tax_percent || 0);
      const itemTax = Math.round(amount * taxPct) / 100;
      total_amount += amount; lineTax += itemTax;
      return { item_name: it.item_name, quantity: qty, unit_price: price, tax_percent: taxPct, tax_amount: itemTax, total_amount: amount };
    });
    // Header tax: as quoted when given, otherwise the sum of the per-line GST.
    const tax_amount = req.body.tax_amount !== undefined && req.body.tax_amount !== null && req.body.tax_amount !== '' ? Number(req.body.tax_amount) : Math.round(lineTax * 100) / 100;
    const net_amount = total_amount + Number(tax_amount || 0) - Number(discount_amount || 0) + Number(shipping_charges || 0);
    const quotation_number = await getNextNumber(clientId, 'QUOTATION', t);
    const quotation = await Quotation.create({
      quotation_number, pr_id: rfq.pr_id || null, vendor_id: vendorId, client_id: clientId,
      valid_until: valid_until || null, currency, total_amount, tax_amount, discount_amount, shipping_charges,
      net_amount, status: 'SUBMITTED', remarks: remarks || null, created_by: req.user && req.user.id,
      // Link back to the vendor's reply email when the quotation was filled from it.
      attachments: source_email && source_email.message_id ? [{ type: 'EMAIL_REPLY', ...source_email }] : null
    }, { transaction: t });
    for (const qi of qItems) {
      await QuotationItem.create({ quotation_id: quotation.id, client_id: clientId, ...qi }, { transaction: t });
    }
    await rv.update({ invite_status: 'RESPONDED', response_quotation_id: quotation.id }, { transaction: t });

    // roll up RFQ status
    const all = await RfqVendor.findAll({ where: { rfq_id: id }, transaction: t });
    const responded = all.filter(x => x.invite_status === 'RESPONDED').length;
    await rfq.update({ status: responded >= all.length ? 'PARTIALLY_RESPONDED' : 'PARTIALLY_RESPONDED' }, { transaction: t });

    await t.commit();
    const { recordAudit } = require('../utils/financeAudit');
    await recordAudit(req, { module: 'RFQ', entityType: 'QUOTATION', entityId: quotation.id, action: 'RFQ_QUOTATION_RECORDED', after: quotation, note: source_email && source_email.message_id ? `Filled from ${source_email.from || 'the vendor'}'s reply "${source_email.subject || ''}" and reviewed` : 'Entered manually' });
    return success(res, { quotation_id: quotation.id, quotation_number }, 'Vendor response recorded as quotation', 201);
  } catch (e) { await t.rollback(); return fail(res, e.message || 'Internal Server Error'); }
};

// POST /api/rfqs/:id/vendors — attach vendors from Vendor Master to an open RFQ
exports.addVendors = async (req, res) => {
  try {
    const incoming = [...new Set((Array.isArray(req.body.vendor_ids) ? req.body.vendor_ids : [])
      .map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!incoming.length) return fail(res, 'Select at least one vendor', 400);

    const rfq = await Rfq.findOne({
      where: { id: req.params.id, ...buildWhere(req) },
      include: [{ model: RfqVendor, as: 'vendors' }]
    });
    if (!rfq) return fail(res, 'RFQ not found', 404);
    if (rfq.status === 'CLOSED' || rfq.status === 'CANCELLED') return fail(res, 'Vendors cannot be added to a closed RFQ', 400);

    const existing = new Set((rfq.vendors || []).map((row) => Number(row.vendor_id)));
    const toAdd = incoming.filter((id) => !existing.has(id));
    if (!toAdd.length) return success(res, { added: 0 }, 'Selected vendors are already on this RFQ');
    if (existing.size + toAdd.length > MAX_VENDORS) return fail(res, `A maximum of ${MAX_VENDORS} vendors can be selected per RFQ`, 400);

    const vendors = await Vendor.findAll({ where: { id: { [Op.in]: toAdd } } });
    if (vendors.length !== toAdd.length) return fail(res, 'One or more vendors not found', 400);
    for (const vendor of vendors) {
      if (vendor.client_id && Number(vendor.client_id) !== Number(rfq.client_id)) {
        return fail(res, 'A selected vendor does not belong to your tenant', 403);
      }
    }
    for (const vendorId of toAdd) {
      await RfqVendor.create({ rfq_id: rfq.id, vendor_id: vendorId, client_id: rfq.client_id, invite_status: 'PENDING' });
    }
    return success(res, { added: toAdd.length }, 'Vendor added to RFQ');
  } catch (e) { return fail(res, e.message || 'Failed to add vendor'); }
};

// POST /api/rfqs/:id/close  |  /cancel
exports.closeRfq = async (req, res) => {
  try {
    const rfq = await Rfq.findOne({ where: { id: req.params.id, ...buildWhere(req) } });
    if (!rfq) return fail(res, 'RFQ not found', 404);
    await rfq.update({ status: req.body && req.body.cancel ? 'CANCELLED' : 'CLOSED' });
    return success(res, { id: rfq.id, status: rfq.status }, 'RFQ updated');
  } catch (e) { return fail(res, e.message); }
};

// ── Vendor replies (read from the admin's connected Outlook) ────────────────
const rfqWithVendors = (req) => Rfq.findOne({
  where: { id: req.params.id, ...buildWhere(req) },
  include: [{ model: RfqVendor, as: 'vendors', include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'email'] }] }]
});
const replyError = (res, e) => {
  const { MailboxError } = require('../services/userMailbox.service');
  if (e instanceof MailboxError) return res.status(e.status).json({ success: false, code: e.code, message: e.message });
  return fail(res, e.message);
};

// GET /api/rfqs/:id/replies
exports.listReplies = async (req, res) => {
  try {
    const rfq = await rfqWithVendors(req);
    if (!rfq) return fail(res, 'RFQ not found', 404);
    const { listReplies } = require('../services/rfqReplies.service');
    const data = await listReplies({ rfq, userId: req.user.id });
    return success(res, data, `${data.replies.length} vendor repl${data.replies.length === 1 ? 'y' : 'ies'} found`);
  } catch (e) { return replyError(res, e); }
};

// GET /api/rfqs/:id/replies/:messageId
exports.getReply = async (req, res) => {
  try {
    const rfq = await rfqWithVendors(req);
    if (!rfq) return fail(res, 'RFQ not found', 404);
    const { getReply } = require('../services/rfqReplies.service');
    return success(res, await getReply({ rfq, userId: req.user.id, messageId: req.params.messageId }));
  } catch (e) { return replyError(res, e); }
};

// GET /api/rfqs/:id/replies/:messageId/attachments/:attachmentId
exports.getReplyAttachment = async (req, res) => {
  try {
    const rfq = await rfqWithVendors(req);
    if (!rfq) return fail(res, 'RFQ not found', 404);
    const { getAttachment } = require('../services/rfqReplies.service');
    const file = await getAttachment({ rfq, userId: req.user.id, messageId: req.params.messageId, attachmentId: req.params.attachmentId });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${String(file.name).replace(/["\r\n]/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(file.buffer);
  } catch (e) { return replyError(res, e); }
};

// GET /api/rfqs/replies/pending — vendor replies still waiting to be entered as quotations
exports.pendingReplies = async (req, res) => {
  try {
    const rfqs = await Rfq.findAll({
      where: { ...buildWhere(req), status: ['SENT', 'PARTIALLY_RESPONDED'] },
      include: [{ model: RfqVendor, as: 'vendors', include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'email'] }] }],
      order: [['id', 'DESC']],
      limit: 20
    });
    const { listPendingReplies } = require('../services/rfqReplies.service');
    const replies = await listPendingReplies({ rfqs, userId: req.user.id });
    return success(res, { replies }, `${replies.length} vendor repl${replies.length === 1 ? 'y' : 'ies'} waiting for a quotation`);
  } catch (e) { return replyError(res, e); }
};

// POST /api/rfqs/:id/replies/:messageId/quotation-draft — AI pre-fill of the quotation from a reply
exports.quotationDraftFromReply = async (req, res) => {
  try {
    const rfq = await rfqWithVendors(req);
    if (!rfq) return fail(res, 'RFQ not found', 404);
    const items = await RfqItem.findAll({ where: { rfq_id: rfq.id }, order: [['id', 'ASC']] });
    const { replySource } = require('../services/rfqReplies.service');
    const { reply, file, emailText } = await replySource({ rfq, userId: req.user.id, messageId: req.params.messageId });
    const rv = (rfq.vendors || []).find((v) => Number(v.vendor_id) === Number(reply.vendor_id));
    if (rv && rv.invite_status === 'RESPONDED') {
      return res.status(409).json({ success: false, code: 'ALREADY_QUOTED', message: `${reply.vendor_name} already has a quotation for this RFQ.` });
    }
    const { extractQuotation } = require('../services/quotationExtraction.service');
    const { draft, checks } = await extractQuotation({ file, emailText, rfq: { rfq_number: rfq.rfq_number, items: items.map((i) => i.get({ plain: true })) } });
    return success(res, {
      rfq_id: rfq.id,
      rfq_number: rfq.rfq_number,
      vendor_id: reply.vendor_id,
      vendor_name: reply.vendor_name,
      email: { message_id: reply.id, subject: reply.subject, from: reply.from_email, received_at: reply.received_at, web_link: reply.web_link },
      source: file ? `attachment ${file.name}` : 'email text',
      rfq_items: items.map((i) => ({ item_name: i.item_name, quantity: Number(i.quantity || 0), unit: i.unit })),
      draft,
      checks
    }, draft.is_quotation ? 'Quotation read from the vendor reply' : 'No prices were found in this reply');
  } catch (e) {
    const { ExtractionError } = require('../services/vendorExtraction.service');
    if (e instanceof ExtractionError) return res.status(e.status).json({ success: false, code: e.code, message: e.message });
    return replyError(res, e);
  }
};
