'use strict';

/**
 * GST checks on a vendor bill, from what is printed on it. No outside service is called.
 *
 *  - the vendor's GSTIN on the bill is a real GSTIN (check digit) and is the one in Vendor Master
 *  - the PAN inside the GSTIN is the vendor's PAN
 *  - the bill is addressed to one of the company's own GSTINs (needed to claim GST credit)
 *  - IGST for an inter-state bill, CGST + SGST (equal) for an intra-state one
 *  - the IRN, when printed, looks like an IRN; a vendor that must e-invoice has one on its bill
 *
 * Every result is a warning ({ field: 'gst.*', severity, message }): it is shown to the reviewer and
 * stops automatic submission, but never blocks a person from submitting.
 */
const { Op } = require('sequelize');
const { Entity, EntityGstRegistration, Property } = require('../models');
const { clean, checkGstin, stateOf, panOf } = require('../utils/gstin');
const { toNumber } = require('./invoiceExtraction.service');

const IRN_RE = /^[0-9a-f]{64}$/i;

/** The GST facts printed on the bill, from an extraction (POST /ap-invoices/extract shape). */
function factsFromExtraction(extraction) {
  if (!extraction?.header) return null;
  const h = extraction.header;
  return cleanFacts({
    vendor_gstin: extraction.party?.gst_number?.value,
    buyer_gstin: h.buyer_gst_number?.value,
    irn: h.irn?.value,
    tax_amount: h.tax_amount?.value,
    igst_amount: h.igst_amount?.value,
    cgst_amount: h.cgst_amount?.value,
    sgst_amount: h.sgst_amount?.value
  });
}

/** Normalises facts (also those the browser sends with the review form). Null if none. */
function cleanFacts(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    vendor_gstin: clean(raw.vendor_gstin) || null,
    buyer_gstin: clean(raw.buyer_gstin) || null,
    irn: String(raw.irn || '').replace(/\s/g, '') || null,
    tax_amount: toNumber(raw.tax_amount),
    igst_amount: toNumber(raw.igst_amount),
    cgst_amount: toNumber(raw.cgst_amount),
    sgst_amount: toNumber(raw.sgst_amount)
  };
}

/** Every GSTIN the company holds: entity GSTINs, GST registrations and property GSTINs. */
async function companyGstins(clientId) {
  const [entities, regs, props] = await Promise.all([
    Entity.findAll({ where: { client_id: clientId, gst_number: { [Op.ne]: null } }, attributes: ['gst_number'] }).catch(() => []),
    EntityGstRegistration ? EntityGstRegistration.findAll({ where: { client_id: clientId, is_active: true }, attributes: ['gstin'] }).catch(() => []) : [],
    Property.findAll({ where: { client_id: clientId, gstin: { [Op.ne]: null } }, attributes: ['gstin'] }).catch(() => [])
  ]);
  return [...new Set([...entities.map((e) => e.gst_number), ...regs.map((r) => r.gstin), ...props.map((p) => p.gstin)]
    .map(clean).filter((g) => g.length === 15))];
}

/**
 * @param {{ clientId: number, vendor: object|null, facts: object|null, propertyId?: number|null }} input
 * @returns {Promise<Array<{ field: string, severity: 'warning', message: string }>>}
 */
async function gstIssues({ clientId, vendor, facts, propertyId = null }) {
  const out = [];
  if (!facts) return out;
  const add = (field, message) => out.push({ field: `gst.${field}`, severity: 'warning', message });
  const gstCharged = (facts.tax_amount || 0) > 0 || (facts.igst_amount || 0) > 0 || (facts.cgst_amount || 0) > 0;

  // Vendor GSTIN
  const master = clean(vendor?.gst_number) || null;
  const onBill = facts.vendor_gstin;
  if (onBill) {
    const c = checkGstin(onBill);
    if (!c.valid) add('vendor', `The vendor GSTIN on the bill (${onBill}) is not a valid GSTIN: ${c.reason}`);
    if (master && onBill !== master) add('vendor', `The vendor GSTIN on the bill (${onBill}) is not the one in Vendor Master (${master})`);
  } else if (gstCharged) {
    add('vendor', 'GST is charged, but the vendor\'s GSTIN is not printed on the bill');
  }
  if (master && master !== onBill) {
    const c = checkGstin(master);
    if (!c.valid) add('vendor', `The GSTIN in Vendor Master (${master}) is not a valid GSTIN: ${c.reason}`);
  }
  const gstinForPan = onBill || master;
  const vendorPan = String(vendor?.pan_number || '').trim().toUpperCase();
  if (gstinForPan && vendorPan && panOf(gstinForPan) && panOf(gstinForPan) !== vendorPan) {
    add('vendor', `The PAN inside the GSTIN (${panOf(gstinForPan)}) is not the vendor's PAN (${vendorPan})`);
  }

  // Bill addressed to us
  const ours = await companyGstins(clientId);
  if (ours.length && gstCharged) {
    if (!facts.buyer_gstin) add('buyer', 'Your company\'s GSTIN is not printed on the bill (needed to claim the GST credit)');
    else if (!ours.includes(facts.buyer_gstin)) add('buyer', `The bill is addressed to GSTIN ${facts.buyer_gstin}, which is not one of your company's GSTINs`);
  }

  // IGST vs CGST + SGST
  const vendorState = stateOf(onBill) || stateOf(master) || (vendor?.gst_registered_state_code ? String(vendor.gst_registered_state_code).padStart(2, '0') : null);
  // Our state: from the GSTIN on the bill only when it is really ours, else the property, else our only state.
  let buyerState = facts.buyer_gstin && ours.includes(facts.buyer_gstin) ? stateOf(facts.buyer_gstin) : null;
  if (!buyerState && propertyId) {
    const prop = await Property.findOne({ where: { id: propertyId, client_id: clientId }, attributes: ['state_code', 'gstin'] }).catch(() => null);
    buyerState = (prop?.state_code ? String(prop.state_code).padStart(2, '0') : null) || stateOf(prop?.gstin);
  }
  if (!buyerState) {
    const states = [...new Set(ours.map(stateOf).filter(Boolean))];
    if (states.length === 1) buyerState = states[0];
  }
  const igst = facts.igst_amount || 0;
  const cgst = facts.cgst_amount || 0;
  const sgst = facts.sgst_amount || 0;
  if (vendorState && buyerState && (igst > 0 || cgst > 0 || sgst > 0)) {
    if (vendorState === buyerState && igst > 1) {
      add('tax', `IGST is charged, but the vendor and your company are both in state ${vendorState}: it should be CGST + SGST`);
    }
    if (vendorState !== buyerState && cgst + sgst > 1) {
      add('tax', `CGST/SGST is charged on an inter-state bill (vendor in state ${vendorState}, you in ${buyerState}): it should be IGST`);
    }
  }
  if (cgst > 0 && sgst > 0 && Math.abs(cgst - sgst) > 1) add('tax', `CGST (${cgst}) and SGST (${sgst}) should be equal`);

  // IRN
  if (facts.irn && !IRN_RE.test(facts.irn)) add('irn', 'The IRN on the bill does not look valid (an IRN is 64 letters and digits)');
  if (vendor?.einvoice_applicable && !facts.irn) add('irn', 'This vendor must issue e-invoices, but no IRN is printed on the bill (without it the GST credit is not allowed)');

  return out;
}

module.exports = { factsFromExtraction, cleanFacts, companyGstins, gstIssues };
