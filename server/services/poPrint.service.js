'use strict';

/**
 * CFG-01 - PO Print service (pdfkit, pure draw - no HTML, no headless browser).
 * Tenant-aware: letterhead/T&C from po_print_config (entity -> client -> provider default);
 * PO/vendor/buyer/ship-to from masters. All values drawn as text (no markup injection surface).
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  PurchaseOrder, PurchaseOrderItem, Vendor, Quotation, Property, PurchaseRequisition,
  PoPrintConfig, Company, ApprovalLog, User, Entity
} = require('../models');
const { isPlaceOfSupplyEnabled, resolveBuyerGstin } = require('./entityGstResolver');

// Normalise text to glyphs the built-in Helvetica (WinAnsi) can render - avoids garbled output.
const clean = (v) => String(v == null ? '' : v)
  .replace(/[‘’‚‛′]/g, "'")
  .replace(/[“”„″]/g, '"')
  .replace(/[–—―]/g, '-')
  .replace(/[•●·‣⁃∙]/g, '-')
  .replace(/₹/g, 'Rs.')
  .replace(/…/g, '...')
  .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
const S = (v) => clean(v === null || v === undefined || v === '' ? '-' : String(v));
const money = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');

async function resolveConfig(clientId, entityId) {
  // Tenant-scoped config first (identity + content) — a tenant's own letterhead.
  if (clientId) {
    if (entityId) {
      const r = await PoPrintConfig.findOne({ where: { client_id: clientId, entity_id: entityId, is_active: true } });
      if (r) return r;
    }
    const r = await PoPrintConfig.findOne({ where: { client_id: clientId, entity_id: null, is_active: true } });
    if (r) return r;
  }
  // Provider-default fallback: supply GENERIC scaffolding (T&C, labels, payment terms) ONLY.
  // STRIP every company-IDENTITY field so one tenant's name/GST/PAN/logo/address can NEVER
  // print on another tenant's PO (cross-tenant leak). Identity then falls back to the PO's
  // own tenant Company master in buyerHeader.
  const pd = await PoPrintConfig.findOne({ where: { client_id: null, entity_id: null, is_active: true } });
  if (pd) {
    const safe = pd.toJSON ? pd.toJSON() : { ...(pd.dataValues || pd) };
    safe.company_name = null; safe.registered_address = null; safe.gst_number = null;
    safe.pan_number = null; safe.isd_number = null;
    safe.logo_url = null; safe.logo_data = null; safe.logo_mime = null; safe.has_logo = false;
    return safe;
  }
  return {};
}

async function loadPo(poId, clientId) {
  return PurchaseOrder.findOne({
    where: { id: poId, ...(clientId ? { client_id: clientId } : {}) },
    include: [
      { model: PurchaseOrderItem, as: 'items' },
      { model: Vendor },
      { model: Quotation, as: 'Quotation', attributes: ['id', 'quotation_number', 'pr_id'], include: [{ model: PurchaseRequisition, as: 'PR', attributes: ['pr_number'] }] },
      { model: Property },
      { model: Entity, as: 'Entity' },
      { model: PurchaseRequisition, attributes: ['id', 'pr_number', 'requested_by_user_id', 'requestor_id', 'requestor_name'] }
    ]
  });
}

async function findApprover(poId, clientId) {
  const log = await ApprovalLog.findOne({
    where: { module: 'PO', reference_id: poId, action: 'APPROVED', ...(clientId ? { client_id: clientId } : {}) },
    order: [['timestamp', 'DESC']]
  });
  if (!log) return '-';
  const u = await User.findByPk(log.user_id, { attributes: ['first_name', 'last_name'] });
  return u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || '-' : '-';
}

async function findRequestor(po) {
  if (po.requestor_name) return po.requestor_name; // requestor arc: free-text requestor wins
  const pr = po.PurchaseRequisition;
  if (pr && pr.requestor_name) return pr.requestor_name;
  const uid = pr && (pr.requested_by_user_id || pr.requestor_id);
  if (!uid) return '-';
  const u = await User.findByPk(uid, { attributes: ['first_name', 'last_name'] });
  return u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || '-' : '-';
}

async function buyerHeader(clientId, cfg) {
  let company_name = cfg.company_name, address = cfg.registered_address, gst = cfg.gst_number, pan = cfg.pan_number;
  if (!company_name) {
    const company = await Company.findOne({ where: clientId ? { client_id: clientId } : {} }).catch(() => null);
    if (company) {
      company_name = company.company_name;
      address = address || company.address_line_1;
      gst = gst || company.gst_registration_number;
    }
  }
  return { company_name: company_name || 'Company Name', address: address || '', gst: gst || '', pan: pan || '', isd: cfg.isd_number || '' };
}

async function findDoaApproval(poId, clientId) {
  try {
    const { DoaApprovalRequest, DoaApprovalStep } = require('../models');
    const req = await DoaApprovalRequest.findOne({ where: { module: 'PO', document_id: poId, ...(clientId ? { client_id: clientId } : {}) }, order: [['id', 'DESC']] });
    if (!req) return null;
    const steps = await DoaApprovalStep.findAll({ where: { request_id: req.id }, order: [['seq', 'ASC']] });
    const approved = steps.filter((s) => s.status === 'APPROVED').map((s) => ({
      name: s.requirement_type === 'ANY_ONE_OF' ? (s.decided_email || 'Panel approval') : (s.approver_name || s.approver_email || 'Approver'),
      at: s.decided_at
    }));
    return { status: req.status, approved, total: steps.length };
  } catch (e) { return null; }
}

async function generatePoPdf(poId, clientId) {
  const po = await loadPo(poId, clientId);
  if (!po) { const e = new Error('PO not found'); e.status = 404; throw e; }
  const cfg = await resolveConfig(clientId, po.entity_id || null);
  // Phase 4b: T&C resolution — PO override -> department default -> tenant default
  let deptTerms = null;
  if (po.department_id) { try { const { PoTermsDefault } = require('../models'); deptTerms = await PoTermsDefault.findOne({ where: { client_id: clientId, department_id: po.department_id } }); } catch (e) { deptTerms = null; } }
  const termWarranty = po.po_warranty || (deptTerms && deptTerms.warranty) || cfg.default_warranty;
  const termPayment = po.po_payment_terms || (deptTerms && deptTerms.payment_terms) || cfg.default_payment_terms;
  const termClauses = po.po_terms || (deptTerms && deptTerms.terms_conditions) || cfg.terms_conditions;
  const header = await buyerHeader(clientId, cfg);
  // Phase C: buying-entity line (brand header stays cfg.company_name e.g. 'Group Co').
  // Flag-gated; null/absent -> no line -> byte-identical to today.
  let buyerGstin = '';
  let entityLine = null;
  if (po.entity_id && po.Entity) {
    if (await isPlaceOfSupplyEnabled(clientId)) {
      buyerGstin = await resolveBuyerGstin({ entityId: po.entity_id, stateCode: po.Property && po.Property.state_code, clientId }) || '';
    }
    buyerGstin = buyerGstin || po.Entity.gst_number || '';
    // entity line on the letterhead only when place-of-supply is enabled
    if (await isPlaceOfSupplyEnabled(clientId)) {
      entityLine = `Buying Entity: ${po.Entity.entity_name}` + (buyerGstin ? `   GSTIN: ${buyerGstin}` : '');
    }
  }
  const approver = await findApprover(po.id, clientId);
  const requestor = await findRequestor(po);
  const doa = await findDoaApproval(po.id, clientId);
  const vendor = po.Vendor || {};
  const items = po.items || [];

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const L = 40, R = 555; const W = R - L;
  const navy = '#1F3A5F', gray = '#555555';

  // header: company block top-left, logo top-right corner, title centered below
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(15).text(S(header.company_name), L, 40, { width: W - 210 });
  doc.fillColor(gray).font('Helvetica').fontSize(8.5);
  if (header.address) doc.text(clean(header.address), L, doc.y + 1, { width: W - 210 });
  const idline = entityLine ? '' : [header.gst && `GST: ${header.gst}`, header.isd && `ISD: ${header.isd}`, header.pan && `PAN: ${header.pan}`].filter(Boolean).join('    ');
  if (idline) doc.text(clean(idline), L, doc.y + 1);
  if (entityLine) {
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(9).text(clean(entityLine), L, doc.y + 2, { width: W - 210 });
    doc.fillColor(gray).font('Helvetica').fontSize(8.5);
  }
  try {
    if (cfg.logo_data) {
      doc.image(cfg.logo_data, R - 200, 30, { fit: [200, 100], align: 'right', valign: 'top' });
    } else if (cfg.logo_url) {
      const lp = path.join(__dirname, '..', String(cfg.logo_url).replace(/^[\\/]+/, ''));
      if (fs.existsSync(lp)) doc.image(lp, R - 200, 30, { fit: [200, 100], align: 'right', valign: 'top' });
    }
  } catch (e) { /* logo optional */ }
  let y = Math.max(doc.y, 118) + 6;
  doc.moveTo(L, y).lineTo(R, y).strokeColor('#CCCCCC').stroke(); y += 6;
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(14).text('PURCHASE ORDER', L, y, { width: W, align: 'center' });
  y = doc.y + 8;

  // meta
  const meta = [];
  if (cfg.show_pr_number !== false) meta.push(['PR No', S((po.PurchaseRequisition && po.PurchaseRequisition.pr_number) || (po.Quotation && po.Quotation.PR && po.Quotation.PR.pr_number))]);
  meta.push(['PO No', S(po.po_number)]);
  meta.push(['PO Date', dt(po.order_date)]);
  if (cfg.show_quotation_number !== false) meta.push(['Quotation No', S(po.Quotation && po.Quotation.quotation_number)]);
  meta.push(['Supplier No', S(vendor.vendor_code)]);
  meta.push(['Status', S(po.status)]);
  doc.fontSize(9);
  meta.forEach((row, i) => {
    const col = i % 2, rowY = y + Math.floor(i / 2) * 15, x = L + col * (W / 2);
    doc.fillColor(gray).font('Helvetica-Bold').text(row[0] + ':', x, rowY);
    doc.fillColor('#222').font('Helvetica').text(row[1], x + 70, rowY);
  });
  y += Math.ceil(meta.length / 2) * 15 + 8;

  // supplier + bill-to / ship-to
  const half = W / 2 - 6;
  const rightX = L + W / 2 + 6;
  const boxTop = y;
  const drawBox = (x, top, title, lines) => {
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(9).text(clean(title), x, top);
    doc.fillColor('#222').font('Helvetica').fontSize(8.5);
    let yy = top + 13;
    lines.forEach((ln) => { doc.text(clean(ln), x, yy, { width: half }); yy = doc.y + 1; });
    return yy;
  };
  const supLines = [
    `${S(vendor.vendor_name)}`,
    `GST: ${S(vendor.gst_number)}   PAN: ${S(vendor.pan_number)}`,
    `Contact: ${S(vendor.contact_person)}`,
    `Email: ${S(vendor.email)}`,
    `${S(vendor.address)}`
  ];
  // Bill To = the buying legal entity (name + address + its GSTIN/PAN); the brand header is only the masthead.
  let billName, billAddr, billGstLine = '';
  if (po.entity_id && po.Entity) {
    billName = po.Entity.entity_name;
    billAddr = po.Entity.address || '';
    const pan = buyerGstin && buyerGstin.length >= 12 ? buyerGstin.slice(2, 12) : '';
    billGstLine = buyerGstin ? ('GST: ' + buyerGstin + (pan ? '   PAN: ' + pan : '')) : '';
  } else {
    billName = header.company_name; billAddr = header.address;
    billGstLine = header.gst ? ('GST: ' + header.gst + (header.pan ? '   PAN: ' + header.pan : '')) : '';
  }
  const shipName = po.ship_to_name || (po.Property && po.Property.property_name) || billName;
  const shipAddr = po.ship_to_address || (po.Property && po.Property.address) || billAddr;
  const billLines = [S(billName), billAddr ? S(billAddr) : null, billGstLine || null].filter((x) => x);
  const supBottom = drawBox(L, boxTop, 'Supplier Details', supLines);
  const billBottom = drawBox(rightX, boxTop, 'Bill To', billLines);
  const shipBottom = drawBox(rightX, billBottom + 6, 'Ship To', [S(shipName), S(shipAddr)]);
  y = Math.max(supBottom, shipBottom) + 8;

  // line items
  const cols = [
    { t: 'SL', x: L, w: 28 },
    { t: 'Item Description', x: L + 28, w: 250 },
    { t: 'Qty', x: L + 278, w: 60 },
    { t: 'Unit Price', x: L + 338, w: 100 },
    { t: 'Total Value', x: L + 438, w: W - 438 }
  ];
  doc.rect(L, y, W, 16).fill(navy);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8.5);
  cols.forEach((c) => doc.text(c.t, c.x + 3, y + 4, { width: c.w - 6, align: (c.t === 'SL' || c.t === 'Item Description') ? 'left' : 'right' }));
  y += 16;
  doc.font('Helvetica').fontSize(8.5).fillColor('#222');
  items.forEach((it, i) => {
    const rowH = 15;
    if (y > 740) { doc.addPage(); y = 50; }
    if (i % 2 === 1) { doc.rect(L, y, W, rowH).fill('#F4F6F9'); }
    doc.fillColor('#222');
    doc.text(String(i + 1), cols[0].x + 3, y + 3, { width: cols[0].w - 6 });
    doc.text(S(it.item_name), cols[1].x + 3, y + 3, { width: cols[1].w - 6 });
    doc.text(String(Number(it.quantity || 0)), cols[2].x + 3, y + 3, { width: cols[2].w - 6, align: 'right' });
    doc.text(money(it.unit_price), cols[3].x + 3, y + 3, { width: cols[3].w - 6, align: 'right' });
    doc.text(money(it.total_price), cols[4].x + 3, y + 3, { width: cols[4].w - 6, align: 'right' });
    y += rowH;
  });
  doc.moveTo(L, y).lineTo(R, y).strokeColor('#CCCCCC').stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(navy).text('Grand Total:', cols[3].x, y + 5, { width: cols[3].w - 6, align: 'right' });
  doc.text(money(po.total_amount), cols[4].x + 3, y + 5, { width: cols[4].w - 6, align: 'right' });
  y += 24;

  // terms
  if (y > 680) { doc.addPage(); y = 50; }
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(9).text('TERMS & CONDITIONS', L, y); y = doc.y + 3;
  doc.fillColor('#222').font('Helvetica').fontSize(8.5);
  doc.text(`Delivery Date: ${dt(po.required_date)}`, L, y);
  doc.text(`Warranty: ${S(termWarranty)}`, L, doc.y + 1);
  doc.text(`Payment Terms: ${S(termPayment)}`, L, doc.y + 1);
  if (termClauses) doc.text(clean(termClauses), L, doc.y + 3, { width: W, align: 'left' });
  y = doc.y + 24;

  // signatures
  if (y > 760) { doc.addPage(); y = 60; }
  doc.fillColor('#222').font('Helvetica').fontSize(9);
  doc.text(`${S(cfg.requested_by_label || 'Requested by')}: ${requestor}`, L, y);
  if (doa && doa.status === 'APPROVED' && doa.approved.length) {
    doc.fillColor('#222').font('Helvetica-Bold').fontSize(9).text(`Approved via DOA (${doa.approved.length} of ${doa.total}):`, rightX, y);
    let ay = doc.y + 1;
    doc.font('Helvetica').fontSize(7.8).fillColor(gray);
    doa.approved.forEach((a) => { doc.text(clean(a.name + (a.at ? '  -  ' + dt(a.at) : '')), rightX, ay, { width: half }); ay = doc.y + 1; });
    doc.fillColor('#222').fontSize(9);
  } else {
    doc.text(`${S(cfg.approved_by_label || 'PO approved by')}: ${approver}`, rightX, y);
  }
  if (cfg.footer_note) doc.fillColor(gray).fontSize(7.5).text(clean(cfg.footer_note), L, 800, { width: W, align: 'center' });

  doc.end();
  return done;
}

module.exports = { generatePoPdf, resolveConfig };
