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
const emailService = require('../services/notificationEmail.service');
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
        { model: RfqVendor, as: 'vendors', include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'email'] }, { model: Quotation, as: 'response', required: false }] }
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

    // Buyer branding: PR entity -> Company master -> default
    let buyerName = 'Fixtag';
    let buyerGst = '';
    try {
      if (rfq.pr_id) {
        const pr = await PurchaseRequisition.findByPk(rfq.pr_id);
        if (pr && pr.entity_id && Entity) {
          const ent = await Entity.findByPk(pr.entity_id);
          if (ent) { buyerName = ent.entity_name || buyerName; buyerGst = ent.gst_number || ''; }
        }
      }
      if (buyerName === 'Fixtag' && Company) {
        const comp = await Company.findOne({ where: { client_id: rfq.client_id } });
        if (comp) { buyerName = comp.company_name || buyerName; buyerGst = buyerGst || comp.gst_registration_number || ''; }
      }
    } catch (brandErr) { /* branding optional */ }

    const due = rfq.due_date ? new Date(rfq.due_date).toDateString() : 'the earliest';
    const td = 'border:1px solid #ddd;padding:6px;';
    const th = 'border:1px solid #ddd;padding:6px;background:#1F3A5F;color:#fff;';
    const rows = (rfq.items || []).map((it, i) =>
      `<tr><td style="${td}">${i + 1}</td><td style="${td}">${it.item_name || ''}${it.description ? ' - ' + it.description : ''}</td><td style="${td}text-align:right;">${Number(it.quantity || 0)}</td><td style="${td}">${it.unit || 'Nos'}</td></tr>`
    ).join('');
    const itemsTable = rows
      ? `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;"><thead><tr><th style="${th}">#</th><th style="${th}text-align:left;">Item / Description</th><th style="${th}">Qty</th><th style="${th}">Unit</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p>(Item details will be shared separately.)</p>';

    const html =
      `<div style="font-family:Arial,sans-serif;color:#222;max-width:680px;">` +
      `<h2 style="color:#1F3A5F;margin:0 0 4px;">${buyerName}</h2>` +
      (buyerGst ? `<div style="color:#666;font-size:12px;">GSTIN: ${buyerGst}</div>` : '') +
      `<h3 style="color:#1F3A5F;">Request for Quotation - ${rfq.rfq_number}</h3>` +
      `<p>Dear Vendor,</p>` +
      `<p>${buyerName} invites your most competitive quotation for the items below. Kindly submit your quotation by <b>${due}</b>.</p>` +
      itemsTable +
      `<p style="margin-bottom:4px;"><b>Please include in your quotation:</b></p>` +
      `<ol style="margin:0 0 12px;padding-left:20px;line-height:1.6;"><li>Unit price and total, GST shown separately (HSN/SAC + GST %)</li><li>Delivery timeline and terms</li><li>Payment terms</li><li>Warranty / AMC (if applicable)</li><li>Quotation validity (days), and your GSTIN &amp; PAN</li></ol>` +
      `<p><b>How to respond:</b> reply to this email with your quotation as a PDF, keeping the reference <b>${rfq.rfq_number}</b> in the subject line.</p>` +
      `<p>Regards,<br/>Procurement - ${buyerName}</p>` +
      `<p style="color:#999;font-size:11px;">Sent via Fixtag procurement system.</p>` +
      `</div>`;

    let sent = 0;
    for (const rv of (rfq.vendors || [])) {
      if (rv.invite_status !== 'PENDING') continue;
      const to = rv.vendor && rv.vendor.email;
      if (to) {
        try {
          await emailService.sendEmail({ to, subject: `Request for Quotation ${rfq.rfq_number} - ${buyerName}`, html, from: `${buyerName} Procurement <${emailService.senderEmail()}>` });
        } catch (mailErr) { /* fail-open */ }
      }
      await rv.update({ invite_status: 'SENT', email_sent_at: new Date() });
      sent += 1;
    }
    await rfq.update({ status: 'SENT' });
    const msg = sent === 0 ? 'No pending vendors to send' : `RFQ sent to ${sent} vendor(s)`;
    return success(res, { sent }, msg);
  } catch (e) { return fail(res, e.message); }
};

// POST /api/rfqs/:id/vendors/:vendorId/response — record a vendor quote -> Quotation
exports.recordResponse = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id, vendorId } = req.params;
    const { items = [], valid_until, currency = 'INR', tax_amount = 0, discount_amount = 0, shipping_charges = 0, remarks } = req.body;
    const rfq = await Rfq.findOne({ where: { id, ...buildWhere(req) } });
    if (!rfq) { await t.rollback(); return fail(res, 'RFQ not found', 404); }
    const rv = await RfqVendor.findOne({ where: { rfq_id: id, vendor_id: vendorId } });
    if (!rv) { await t.rollback(); return fail(res, 'Vendor is not part of this RFQ', 400); }
    if (!items.length) { await t.rollback(); return fail(res, 'At least one line item is required', 400); }

    const clientId = rfq.client_id;
    let total_amount = 0;
    const qItems = items.map(it => {
      const qty = Number(it.quantity || 0), price = Number(it.unit_price || 0);
      const amount = qty * price; total_amount += amount;
      return { item_name: it.item_name, quantity: qty, unit_price: price, amount };
    });
    const net_amount = total_amount + Number(tax_amount || 0) - Number(discount_amount || 0) + Number(shipping_charges || 0);
    const quotation_number = await getNextNumber(clientId, 'QUOTATION', t);
    const quotation = await Quotation.create({
      quotation_number, pr_id: rfq.pr_id || null, vendor_id: vendorId, client_id: clientId,
      valid_until: valid_until || null, currency, total_amount, tax_amount, discount_amount, shipping_charges,
      net_amount, status: 'SUBMITTED', remarks: remarks || null
    }, { transaction: t });
    for (const qi of qItems) {
      await QuotationItem.create({ quotation_id: quotation.id, ...qi }, { transaction: t });
    }
    await rv.update({ invite_status: 'RESPONDED', response_quotation_id: quotation.id }, { transaction: t });

    // roll up RFQ status
    const all = await RfqVendor.findAll({ where: { rfq_id: id }, transaction: t });
    const responded = all.filter(x => x.invite_status === 'RESPONDED').length;
    await rfq.update({ status: responded >= all.length ? 'PARTIALLY_RESPONDED' : 'PARTIALLY_RESPONDED' }, { transaction: t });

    await t.commit();
    return success(res, { quotation_id: quotation.id, quotation_number }, 'Vendor response recorded as quotation', 201);
  } catch (e) { await t.rollback(); return fail(res, e.message || 'Internal Server Error'); }
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
