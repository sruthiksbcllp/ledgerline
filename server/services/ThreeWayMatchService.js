'use strict';

const { Op } = require('sequelize');
const {
  Invoice, PurchaseOrder, GRN, GRNItem, PurchaseOrderItem, ThreeWayMatch, APToleranceRule
} = require('../models');

const toNumber = (v) => Number(v || 0);

class ThreeWayMatchService {
  async getActiveRule(clientId) {
    const rule = await APToleranceRule.findOne({
      where: { client_id: clientId, is_active: true },
      order: [['updated_at', 'DESC'], ['id', 'DESC']]
    });
    return rule || {
      tolerance_pct: 5,
      tolerance_amount: 0,
      applies_to: 'BOTH'
    };
  }

  async runMatch(invoiceId, clientId) {
    const invoice = await Invoice.findOne({
      where: { id: invoiceId, ...(clientId ? { client_id: clientId } : {}) }
    });
    if (!invoice) {
      return {
        invoice_id: invoiceId,
        status: 'BLOCKED',
        blocked_reason: 'Invoice not found',
        qty_variance: 0,
        amount_variance: 0,
        tolerance_pct: 0
      };
    }

    const po = await PurchaseOrder.findOne({
      where: { id: invoice.po_id, client_id: invoice.client_id }
    });
    const grn = await GRN.findOne({
      where: { id: invoice.grn_id, client_id: invoice.client_id }
    });

    if (!po || !grn) {
      return {
        invoice_id: invoice.id,
        po_id: invoice.po_id,
        grn_id: invoice.grn_id,
        client_id: invoice.client_id,
        status: 'BLOCKED',
        blocked_reason: 'Missing PO/GRN',
        qty_variance: 0,
        amount_variance: 0,
        tolerance_pct: 0,
        details: null
      };
    }

    const [poItems, grnItems] = await Promise.all([
      PurchaseOrderItem.findAll({ where: { po_id: po.id } }),
      GRNItem.findAll({ where: { grn_id: grn.id } })
    ]);

    const poQty = poItems.reduce((s, i) => s + toNumber(i.quantity), 0);
    const grnQty = grnItems.reduce((s, i) => s + toNumber(i.accepted_quantity || i.received_quantity), 0);
    const invoiceAmount = toNumber(invoice.total_amount || (toNumber(invoice.base_amount) + toNumber(invoice.gst_amount)));
    const poAmount = toNumber(po.total_amount);

    const qtyVariance = Math.abs(grnQty - poQty);
    const amountVariance = Math.abs(invoiceAmount - poAmount);

    const rule = await this.getActiveRule(invoice.client_id);
    const tolerancePct = toNumber(rule.tolerance_pct);
    const toleranceAmount = toNumber(rule.tolerance_amount);
    const appliesTo = String(rule.applies_to || 'BOTH');

    const qtyThreshold = poQty * (tolerancePct / 100);
    const amountThreshold = Math.max(poAmount * (tolerancePct / 100), toleranceAmount);

    const qtyBreached = (appliesTo === 'QTY' || appliesTo === 'BOTH') && qtyVariance > qtyThreshold;
    const amountBreached = (appliesTo === 'AMOUNT' || appliesTo === 'BOTH') && amountVariance > amountThreshold;

    const status = qtyBreached || amountBreached ? 'TOLERANCE_BREACH' : 'MATCHED';
    const blockedReason = status === 'TOLERANCE_BREACH'
      ? `Variance exceeded tolerance: qty=${qtyVariance.toFixed(2)}, amount=${amountVariance.toFixed(2)}`
      : null;

    return {
      invoice_id: invoice.id,
      po_id: po.id,
      grn_id: grn.id,
      client_id: invoice.client_id,
      status,
      blocked_reason: blockedReason,
      qty_variance: qtyVariance.toFixed(2),
      amount_variance: amountVariance.toFixed(2),
      tolerance_pct: tolerancePct,
      details: {
        po_total_qty: poQty,
        grn_total_qty: grnQty,
        po_total_amount: poAmount,
        invoice_total_amount: invoiceAmount,
        qty_threshold: qtyThreshold,
        amount_threshold: amountThreshold
      }
    };
  }

  async createOrUpdateMatch(invoiceId, clientId) {
    const match = await this.runMatch(invoiceId, clientId);
    const payload = {
      po_id: match.po_id || null,
      grn_id: match.grn_id || null,
      invoice_id: match.invoice_id,
      client_id: match.client_id || clientId,
      status: match.status,
      qty_variance: match.qty_variance || 0,
      amount_variance: match.amount_variance || 0,
      tolerance_pct: match.tolerance_pct || 0,
      blocked_reason: match.blocked_reason || null
    };

    const existing = await ThreeWayMatch.findOne({
      where: { invoice_id: invoiceId, ...(clientId ? { client_id: clientId } : {}) }
    });
    if (existing) {
      await existing.update(payload);
      return { ...match, id: existing.id };
    }
    const created = await ThreeWayMatch.create(payload);
    return { ...match, id: created.id };
  }

  async getMatchStatus(invoiceId, clientId) {
    const where = { invoice_id: invoiceId };
    if (clientId) where.client_id = clientId;
    return ThreeWayMatch.findOne({
      where,
      include: [{ model: Invoice, attributes: ['id', 'invoice_number', 'total_amount', 'status'] }]
    });
  }
}

module.exports = new ThreeWayMatchService();

