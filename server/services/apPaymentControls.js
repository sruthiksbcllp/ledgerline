'use strict';

/**
 * Checks run before any payment is recorded on an AP invoice:
 *  - the person who approved the invoice for payment cannot also pay it (maker-checker);
 *  - the vendor must be verified by Compliance. A new vendor starts unverified, and a change to
 *    its bank, GSTIN, PAN or name sends it back to unverified, so the first payment and the first
 *    payment after a bank change always wait for that check.
 * Each returns a message when the payment must stop, otherwise null.
 */
const { Vendor } = require('../models');

function samePersonMessage(invoice, user) {
  if (invoice.approved_by && user?.id && Number(invoice.approved_by) === Number(user.id)) {
    return 'You approved this invoice for payment, so another user must record the payment.';
  }
  return null;
}

async function unverifiedVendorMessage(invoice, transaction) {
  if (!invoice.vendor_id) return null;
  const vendor = await Vendor.findByPk(invoice.vendor_id, { attributes: ['id', 'vendor_name', 'verification_status'], transaction });
  if (!vendor || vendor.verification_status === 'VERIFIED') return null;
  return vendor.verification_status === 'REJECTED'
    ? `Payment is blocked: Compliance rejected the details of vendor ${vendor.vendor_name}.`
    : `Payment is blocked: vendor ${vendor.vendor_name} is not verified yet (new vendor, or its bank / GST details changed). Ask Compliance to verify it in Vendor Master.`;
}

async function paymentBlockReason(invoice, user, transaction) {
  return samePersonMessage(invoice, user) || unverifiedVendorMessage(invoice, transaction);
}

module.exports = { paymentBlockReason };
