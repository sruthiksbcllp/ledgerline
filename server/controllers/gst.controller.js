'use strict';

const GSTService = require('../services/GSTService');
const { Invoice, Vendor } = require('../models');
const { getClientId } = require('../utils/tenantFilter');

exports.validate = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const { gstin } = req.body || {};
    const result = await GSTService.validateVendorGSTIN(gstin, clientId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'GST validation failed' });
  }
};

exports.invoiceCheck = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const invoice = await Invoice.findOne({ where: { id: req.params.id, client_id: clientId }, include: [{ model: Vendor }] });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    const payload = {
      vendor_gstin: invoice.Vendor?.gst_number || null,
      buyer_gstin: process.env.ORG_GSTIN || null,
      cgst_amount: invoice.cgst_amount,
      sgst_amount: invoice.sgst_amount,
      igst_amount: invoice.igst_amount
    };
    const result = GSTService.validateInvoiceGST(payload);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Invoice GST check failed' });
  }
};

exports.vendorStatus = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const vendor = await Vendor.findOne({ where: { id: req.params.id, client_id: clientId } });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const result = await GSTService.validateVendorGSTIN(vendor.gst_number, clientId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Vendor GST status failed' });
  }
};

