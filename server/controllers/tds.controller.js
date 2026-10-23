'use strict';

const { TDSComputation, TDSSection, Invoice, Vendor } = require('../models');
const TDSService = require('../services/TDSService');
const { getClientId } = require('../utils/tenantFilter');

exports.computeTDS = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const invoiceId = Number(req.params.invoiceId || req.body?.invoice_id);
    if (!invoiceId) return res.status(400).json({ success: false, message: 'invoiceId is required' });
    const data = await TDSService.computeTDS(invoiceId, clientId);
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Failed to compute TDS' });
  }
};

exports.getTDSComputation = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const rows = await TDSComputation.findAll({
      where: { client_id: clientId },
      include: [
        { model: Invoice, attributes: ['id', 'invoice_number'] },
        { model: Vendor, attributes: ['id', 'vendor_name'] }
      ],
      order: [['created_at', 'DESC']]
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Failed to fetch TDS computations' });
  }
};

exports.getSections = async (req, res) => {
  try {
    const rows = await TDSSection.findAll({ order: [['section_code', 'ASC']] });
    return res.status(200).json({ success: true, data: rows });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Failed to fetch TDS sections' });
  }
};

exports.updateSection = async (req, res) => {
  try {
    const id = Number(req.params.id || req.body?.id);
    const row = await TDSSection.findByPk(id);
    if (!row) return res.status(404).json({ success: false, message: 'Section not found' });
    await row.update(req.body || {});
    return res.status(200).json({ success: true, data: row });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Failed to update section' });
  }
};

