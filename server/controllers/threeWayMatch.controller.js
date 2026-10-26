'use strict';

const { Invoice, PurchaseOrder, GRN, ThreeWayMatch, APToleranceRule, ServiceEntrySheet } = require('../models');
const ThreeWayMatchService = require('../services/ThreeWayMatchService');
const { getClientId } = require('../utils/tenantFilter');

exports.runMatch = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const invoiceId = Number(req.params.invoiceId);
    const result = await ThreeWayMatchService.createOrUpdateMatch(invoiceId, clientId);
    return res.status(200).json({ success: true, data: result });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Failed to run match' });
  }
};

exports.getMatchStatus = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const invoiceId = Number(req.params.invoiceId);
    const result = await ThreeWayMatchService.getMatchStatus(invoiceId, clientId);
    return res.status(200).json({ success: true, data: result });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Failed to fetch match status' });
  }
};

exports.getToleranceRules = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const rules = await APToleranceRule.findAll({
      where: { client_id: clientId },
      order: [['updated_at', 'DESC']]
    });
    return res.status(200).json({ success: true, data: rules });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Failed to fetch tolerance rules' });
  }
};

exports.saveToleranceRule = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const {
      id, rule_name, tolerance_pct, tolerance_amount, applies_to = 'BOTH', is_active = true
    } = req.body || {};
    if (!rule_name) {
      return res.status(400).json({ success: false, message: 'rule_name is required' });
    }
    const payload = {
      client_id: clientId,
      rule_name,
      tolerance_pct: Number(tolerance_pct || 0),
      tolerance_amount: Number(tolerance_amount || 0),
      applies_to,
      is_active: Boolean(is_active)
    };

    let result;
    if (id) {
      const existing = await APToleranceRule.findOne({ where: { id, client_id: clientId } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Tolerance rule not found' });
      }
      await existing.update(payload);
      result = existing;
    } else {
      result = await APToleranceRule.create(payload);
    }
    return res.status(200).json({ success: true, data: result });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Failed to save tolerance rule' });
  }
};

exports.getInvoiceStatuses = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const invoices = await Invoice.findAll({
      where: { client_id: clientId },
      include: [
        { model: PurchaseOrder, attributes: ['id', 'po_number', 'total_amount'] },
        { model: GRN, attributes: ['id', 'grn_number'] },
        { model: ServiceEntrySheet, attributes: ['id', 'ses_number', 'total_value'], required: false },
        { model: ThreeWayMatch, attributes: ['status', 'qty_variance', 'amount_variance', 'tolerance_pct', 'blocked_reason'], required: false }
      ],
      order: [['createdAt', 'DESC']]
    });
    return res.status(200).json({ success: true, data: invoices });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Failed to fetch invoice statuses' });
  }
};

