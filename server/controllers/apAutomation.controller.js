'use strict';

/**
 * AP invoice automation: extract a vendor bill with AI, match it to the vendor and PO,
 * validate and de-duplicate it, then run Pending -> Approved -> Partially Paid -> Paid
 * (or Rejected) with a full audit trail. Works alongside the existing invoice endpoints.
 */
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const {
  sequelize, Invoice, ApInvoiceLine, ApPayment, Vendor, PurchaseOrder, Property
} = require('../models');
const { buildAdminWhere, getClientId } = require('../utils/tenantFilter');
const { extractInvoice, checkInvoiceNumbers, normalizeDate, toNumber } = require('../services/invoiceExtraction.service');
const { ExtractionError } = require('../services/vendorExtraction.service');
const { recordAudit, documentHistory } = require('../utils/financeAudit');

const STATUS_LABEL = {
  UNPAID: 'Pending', APPROVED_FOR_PAYMENT: 'Approved', PARTIAL: 'Partially Paid', PAID: 'Paid',
  REJECTED: 'Rejected', EXCEPTION: 'Exception', WAITING_FOR_PAYMENT: 'Waiting for payment'
};
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/** Vendor in the caller's company: GSTIN match first, then exact name, then a name contains-match. */
async function matchVendor(tenantWhere, { gst_number, name }) {
  if (gst_number) {
    // Stored GSTINs sometimes carry stray spaces, so compare trimmed and case-insensitively.
    const byGstin = await Vendor.findOne({
      where: { ...tenantWhere, [Op.and]: [sqlWhere(fn('UPPER', fn('TRIM', col('gst_number'))), String(gst_number).trim().toUpperCase())] }
    });
    if (byGstin) return { vendor: byGstin, matched_by: 'GSTIN' };
  }
  const cleanName = String(name || '').trim().toLowerCase();
  if (!cleanName) return { vendor: null, matched_by: null, candidates: [] };
  const exact = await Vendor.findOne({ where: { ...tenantWhere, [Op.and]: [sqlWhere(fn('LOWER', col('vendor_name')), cleanName)] } });
  if (exact) return { vendor: exact, matched_by: 'NAME' };
  const firstWord = cleanName.replace(/\b(pvt|private|ltd|limited|llp|inc|co)\b\.?/g, '').trim().split(/\s+/)[0];
  const candidates = firstWord && firstWord.length >= 3
    ? await Vendor.findAll({ where: { ...tenantWhere, vendor_name: { [Op.like]: `%${firstWord}%` } }, attributes: ['id', 'vendor_name', 'gst_number'], limit: 5 })
    : [];
  return { vendor: null, matched_by: null, candidates };
}

async function findDuplicates(tenantWhere, { vendor_id, invoice_number, total_amount, invoice_date }, excludeId = null) {
  const not = excludeId ? { id: { [Op.ne]: excludeId } } : {};
  const exact = vendor_id && invoice_number
    ? await Invoice.findOne({ where: { ...tenantWhere, ...not, vendor_id, [Op.and]: [sqlWhere(fn('LOWER', col('invoice_number')), String(invoice_number).trim().toLowerCase())] } })
    : null;
  const similar = !exact && vendor_id && total_amount && invoice_date
    ? await Invoice.findOne({ where: { ...tenantWhere, ...not, vendor_id, total_amount: round2(total_amount), invoice_date } })
    : null;
  return { exact, similar };
}

const brief = (inv) => inv && ({ id: inv.id, invoice_number: inv.invoice_number, total_amount: inv.total_amount, invoice_date: inv.invoice_date, status: inv.status });

/** Reviewed payload -> normalised numbers + all checks (arithmetic, vendor, PO, duplicates). */
async function reviewInvoice(req, body, excludeId = null) {
  const tenantWhere = buildAdminWhere(req);
  const data = {
    vendor_id: body.vendor_id ? Number(body.vendor_id) : null,
    po_id: body.po_id ? Number(body.po_id) : null,
    property_id: body.property_id ? Number(body.property_id) : null,
    invoice_number: String(body.invoice_number || '').trim(),
    invoice_date: normalizeDate(body.invoice_date),
    due_date: normalizeDate(body.due_date),
    subtotal: toNumber(body.subtotal),
    tax_amount: toNumber(body.tax_amount) ?? 0,
    tax_rate_percent: toNumber(body.tax_rate_percent),
    total_amount: toNumber(body.total_amount),
    hsn_sac_code: body.hsn_sac_code ? String(body.hsn_sac_code).trim() : null,
    line_items: (Array.isArray(body.line_items) ? body.line_items : []).map((l) => ({
      description: String(l.description || '').trim(),
      quantity: toNumber(l.quantity),
      unit_price: toNumber(l.unit_price),
      amount: toNumber(l.amount) ?? round2((toNumber(l.quantity) ?? 0) * (toNumber(l.unit_price) ?? 0)),
      tax_rate_percent: toNumber(l.tax_rate_percent)
    })).filter((l) => l.description || l.amount)
  };

  const vendor = data.vendor_id ? await Vendor.findOne({ where: { ...tenantWhere, id: data.vendor_id } }) : null;
  const po = data.po_id ? await PurchaseOrder.findOne({ where: { ...tenantWhere, id: data.po_id } }) : null;
  const checks = checkInvoiceNumbers({ ...data, party_name: vendor?.vendor_name || (data.vendor_id ? '' : body.vendor_name) });
  const add = (field, severity, message) => checks.push({ field, severity, message });

  if (!data.vendor_id) add('vendor_id', 'error', 'Select the vendor (or add it in Vendor Master first)');
  else if (!vendor) add('vendor_id', 'error', 'Vendor not found in your company');
  else if (vendor.status === 'BLACKLISTED') add('vendor_id', 'error', 'This vendor is blacklisted');
  if (data.po_id && !po) add('po_id', 'error', 'Purchase order not found in your company');
  if (po && vendor && Number(po.vendor_id) !== Number(vendor.id)) add('po_id', 'error', `PO ${po.po_number} belongs to a different vendor`);
  if (po && data.total_amount && Number(po.total_amount) > 0 && data.total_amount > Number(po.total_amount) * 1.02) {
    add('total_amount', 'warning', `Invoice total exceeds PO ${po.po_number} value of ${po.total_amount}`);
  }
  if (!data.property_id && !po?.property_id) add('property_id', 'error', 'Select the property / site this bill belongs to');
  if (!data.po_id) add('po_id', 'warning', 'No purchase order linked: the bill will not be 3-way matched');

  const { exact, similar } = await findDuplicates(tenantWhere, data, excludeId);
  if (exact) add('invoice_number', 'error', `Duplicate: invoice ${exact.invoice_number} from this vendor is already recorded (#${exact.id}, ${STATUS_LABEL[exact.status] || exact.status})`);
  if (similar) add('invoice_number', 'warning', `Possible duplicate: invoice ${similar.invoice_number} has the same vendor, date and total (#${similar.id})`);

  return { data, vendor, po, checks, duplicate: brief(exact), possibleDuplicate: brief(similar) };
}

exports.extract = async (req, res) => {
  try {
    if (!req.file) return fail(res, 400, 'Choose a file to upload.');
    const result = await extractInvoice(req.file, 'AP');
    const tenantWhere = buildAdminWhere(req);
    const vendorMatch = await matchVendor(tenantWhere, { gst_number: result.party.gst_number.value, name: result.party.name.value });
    let po = null;
    if (result.header.po_number.value) {
      po = await PurchaseOrder.findOne({ where: { ...tenantWhere, po_number: result.header.po_number.value.trim() }, attributes: ['id', 'po_number', 'vendor_id', 'property_id', 'total_amount', 'status'] });
    }
    const { exact, similar } = await findDuplicates(tenantWhere, {
      vendor_id: vendorMatch.vendor?.id,
      invoice_number: result.header.invoice_number.value,
      total_amount: toNumber(result.header.total_amount.value),
      invoice_date: normalizeDate(result.header.invoice_date.value)
    });
    return res.json({
      success: true,
      data: {
        ...result,
        matches: {
          vendor: vendorMatch.vendor ? { id: vendorMatch.vendor.id, vendor_name: vendorMatch.vendor.vendor_name, matched_by: vendorMatch.matched_by } : null,
          vendor_candidates: (vendorMatch.candidates || []).map((v) => ({ id: v.id, vendor_name: v.vendor_name, gst_number: v.gst_number })),
          purchase_order: po ? po.toJSON() : null,
          po_vendor_mismatch: Boolean(po && vendorMatch.vendor && Number(po.vendor_id) !== Number(vendorMatch.vendor.id)),
          duplicate: brief(exact),
          possible_duplicate: brief(similar)
        }
      }
    });
  } catch (error) {
    if (error instanceof ExtractionError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    return fail(res, 500, 'Invoice extraction failed. Enter the bill manually.');
  }
};

exports.validate = async (req, res) => {
  const review = await reviewInvoice(req, req.body || {}, req.body?.id || null);
  return res.json({ success: true, data: { checks: review.checks, duplicate: review.duplicate, possible_duplicate: review.possibleDuplicate } });
};

exports.create = async (req, res) => {
  const review = await reviewInvoice(req, req.body || {});
  const errors = review.checks.filter((c) => c.severity === 'error');
  if (errors.length) {
    return fail(res, review.duplicate ? 409 : 422, errors[0].message, { checks: review.checks });
  }
  const { data, vendor, po } = review;
  const clientId = vendor.client_id || getClientId(req);
  const subtotal = data.subtotal ?? round2(data.total_amount - data.tax_amount);
  try {
    const invoice = await sequelize.transaction(async (transaction) => {
      const created = await Invoice.create({
        client_id: clientId,
        vendor_id: vendor.id,
        po_id: po?.id || null,
        property_id: data.property_id || po?.property_id,
        invoice_number: data.invoice_number,
        invoice_date: data.invoice_date,
        due_date: data.due_date,
        base_amount: subtotal,
        gst_amount: data.tax_amount,
        total_amount: round2(subtotal + data.tax_amount),
        tds_rate_percent: vendor.tds_rate_percent ?? 2,
        tds_section_code: vendor.tds_section_code || null,
        tds_amount: round2((subtotal * Number(vendor.tds_rate_percent ?? 2)) / 100),
        hsn_sac_code: data.hsn_sac_code,
        status: 'UNPAID',
        matching_status: 'PENDING',
        paid_amount: 0,
        source: req.body.source === 'AI_EXTRACTED' ? 'AI_EXTRACTED' : 'MANUAL'
      }, { transaction });
      if (data.line_items.length) {
        await ApInvoiceLine.bulkCreate(data.line_items.map((l, i) => ({
          client_id: clientId, invoice_id: created.id, line_no: i + 1, description: l.description || `Line ${i + 1}`,
          quantity: l.quantity, unit_price: l.unit_price, amount: l.amount ?? 0, tax_rate_percent: l.tax_rate_percent
        })), { transaction });
      }
      return created;
    });
    await recordAudit(req, {
      module: 'AP', entityType: 'INVOICE', entityId: invoice.id, action: 'AP_INVOICE_SUBMITTED', after: invoice,
      note: `${invoice.source === 'AI_EXTRACTED' ? 'Extracted by AI, reviewed and submitted' : 'Entered manually and submitted'} for approval`
    });
    return res.status(201).json({ success: true, message: 'Invoice submitted for approval', data: invoice, checks: review.checks });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return fail(res, 409, 'This invoice number is already recorded for this vendor.');
    return fail(res, 500, error.message || 'Could not save the invoice');
  }
};

exports.list = async (req, res) => {
  const where = { ...buildAdminWhere(req) };
  if (req.query.status) where.status = String(req.query.status).split(',');
  const rows = await Invoice.findAll({
    where,
    include: [
      { model: Vendor, attributes: ['id', 'vendor_name', 'gst_number'] },
      { model: PurchaseOrder, attributes: ['id', 'po_number'] },
      { model: Property, attributes: ['id', 'property_name'] }
    ],
    order: [['id', 'DESC']],
    limit: 500
  });
  return res.json({
    success: true,
    data: rows.map((r) => {
      const j = r.toJSON();
      const balance = round2(Number(j.total_amount || 0) - Number(j.paid_amount || 0));
      const overdue = j.due_date && balance > 0 && !['PAID', 'REJECTED'].includes(j.status) && new Date(j.due_date) < new Date(new Date().toDateString());
      return { ...j, balance, overdue, status_label: STATUS_LABEL[j.status] || j.status };
    })
  });
};

exports.detail = async (req, res) => {
  const tenantWhere = buildAdminWhere(req);
  const invoice = await Invoice.findOne({
    where: { ...tenantWhere, id: req.params.id },
    include: [
      { model: Vendor, attributes: ['id', 'vendor_name', 'gst_number'] },
      { model: PurchaseOrder, attributes: ['id', 'po_number', 'total_amount'] },
      { model: ApInvoiceLine, as: 'lines' },
      { model: ApPayment, as: 'payments' }
    ],
    order: [[{ model: ApInvoiceLine, as: 'lines' }, 'line_no', 'ASC'], [{ model: ApPayment, as: 'payments' }, 'id', 'ASC']]
  });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  const history = await documentHistory(tenantWhere, 'INVOICE', invoice.id);
  const j = invoice.toJSON();
  return res.json({ success: true, data: { ...j, balance: round2(Number(j.total_amount || 0) - Number(j.paid_amount || 0)), status_label: STATUS_LABEL[j.status] || j.status, history } });
};

const loadOwned = (req) => Invoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });

exports.approve = async (req, res) => {
  const invoice = await loadOwned(req);
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (invoice.status !== 'UNPAID') return fail(res, 409, `Only pending invoices can be approved (this one is ${STATUS_LABEL[invoice.status] || invoice.status})`);
  if (invoice.payment_blocked || invoice.matching_status === 'MISMATCHED') {
    return fail(res, 409, 'This invoice has an open matching exception. Resolve it before approving.');
  }
  const before = invoice.toJSON();
  await invoice.update({ status: 'APPROVED_FOR_PAYMENT', approved_by: req.user.id, approved_at: new Date() });
  await recordAudit(req, { module: 'AP', entityType: 'INVOICE', entityId: invoice.id, action: 'AP_INVOICE_APPROVED', before, after: invoice, note: req.body?.comment || null });
  return res.json({ success: true, message: 'Invoice approved for payment', data: invoice });
};

exports.reject = async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return fail(res, 400, 'Give a reason for rejecting the invoice');
  const invoice = await loadOwned(req);
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (!['UNPAID', 'APPROVED_FOR_PAYMENT', 'EXCEPTION'].includes(invoice.status) || Number(invoice.paid_amount) > 0) {
    return fail(res, 409, 'Invoices with payments recorded cannot be rejected');
  }
  const before = invoice.toJSON();
  await invoice.update({ status: 'REJECTED', rejected_by: req.user.id, rejected_at: new Date(), rejection_reason: reason });
  await recordAudit(req, { module: 'AP', entityType: 'INVOICE', entityId: invoice.id, action: 'AP_INVOICE_REJECTED', before, after: invoice, note: reason });
  return res.json({ success: true, message: 'Invoice rejected', data: invoice });
};

exports.recordPayment = async (req, res) => {
  const amount = round2(toNumber(req.body?.amount));
  const paymentDate = normalizeDate(req.body?.payment_date) || new Date().toISOString().slice(0, 10);
  if (!(amount > 0)) return fail(res, 400, 'Enter a payment amount greater than zero');
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const invoice = await Invoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!invoice) return { status: 404, message: 'Invoice not found' };
      if (!['APPROVED_FOR_PAYMENT', 'PARTIAL'].includes(invoice.status)) {
        return { status: 409, message: `Payments can only be recorded on approved invoices (this one is ${STATUS_LABEL[invoice.status] || invoice.status})` };
      }
      if (invoice.payment_blocked) return { status: 409, message: `Payment is blocked: ${invoice.payment_block_reason || 'open exception'}` };
      const balance = round2(Number(invoice.total_amount) - Number(invoice.paid_amount || 0));
      if (amount > balance) return { status: 422, message: `Payment exceeds the balance due of ${balance}` };
      const before = invoice.toJSON();
      const paid = round2(Number(invoice.paid_amount || 0) + amount);
      const fullyPaid = paid >= Number(invoice.total_amount);
      await ApPayment.create({
        client_id: invoice.client_id, invoice_id: invoice.id, amount, payment_date: paymentDate,
        payment_mode: req.body?.payment_mode || null, reference: req.body?.reference || null, notes: req.body?.notes || null, created_by: req.user.id
      }, { transaction });
      await invoice.update({
        paid_amount: paid, status: fullyPaid ? 'PAID' : 'PARTIAL', ...(fullyPaid ? { payment_date: paymentDate } : {})
      }, { transaction });
      return { invoice, before, fullyPaid };
    });
    if (result.status) return fail(res, result.status, result.message);
    await recordAudit(req, {
      module: 'AP', entityType: 'INVOICE', entityId: result.invoice.id,
      action: result.fullyPaid ? 'AP_INVOICE_PAID' : 'AP_PAYMENT_RECORDED', before: result.before, after: result.invoice,
      note: `Payment of ${amount}${req.body?.reference ? ` (ref ${req.body.reference})` : ''}`
    });
    return res.json({ success: true, message: result.fullyPaid ? 'Invoice fully paid' : 'Partial payment recorded', data: result.invoice });
  } catch (error) {
    return fail(res, 500, error.message || 'Could not record the payment');
  }
};

exports.STATUS_LABEL = STATUS_LABEL;
