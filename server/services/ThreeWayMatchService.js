'use strict';

/**
 * Three-way match: PO <-> what was received (goods receipts and approved service entries) <->
 * the invoice, at two levels (P2P spec step 7):
 *
 *   Bill total  - the bill before GST must not exceed what was received on the PO and is not yet
 *                 billed, within the rule's tolerance_pct / tolerance_amount (the backstop).
 *   Each line   - a bill line linked to a PO line (ap_invoice_lines.po_item_id):
 *                   quantity billed <= quantity received and not yet billed (qty_tolerance_pct, 0 = exact)
 *                   rate <= PO rate, the excess within price_tolerance_pct or price_tolerance_amount,
 *                   whichever is lower.
 *
 * Every receipt on the PO counts, so a bill covering several deliveries matches, and a correct
 * bill for a partial delivery is not an exception. Received quantity per PO line comes from the PO
 * line (raised by accepted GRN quantities and approved SES lines), less returns to the vendor.
 */
const { Op } = require('sequelize');
const {
  Invoice, PurchaseOrder, GRN, GRNItem, PurchaseOrderItem, ThreeWayMatch, APToleranceRule, ServiceEntrySheet,
  PurchaseReturn, PurchaseReturnItem, ApInvoiceLine
} = require('../models');

const toNumber = (v) => Number(v || 0);
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const qtyText = (n) => String(Math.round(Number(n || 0) * 1000) / 1000);

const DEFAULT_RULE = {
  tolerance_pct: 5, tolerance_amount: 0, applies_to: 'BOTH',
  price_tolerance_pct: 1, price_tolerance_amount: 100, qty_tolerance_pct: 0
};

const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'to', 'in', 'on', 'nos', 'no', 'pcs', 'pc', 'qty', 'unit', 'units', 'each', 'set', 'item', 'charges', 'charge']);
const tokens = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 2 && !STOP.has(w)));
const similarity = (a, b) => {
  const A = tokens(a); const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  A.forEach((w) => { if (B.has(w)) common += 1; });
  return common / (A.size + B.size - common);
};

class ThreeWayMatchService {
  async getActiveRule(clientId) {
    const rule = await APToleranceRule.findOne({
      where: { client_id: clientId, is_active: true },
      order: [['updated_at', 'DESC'], ['id', 'DESC']]
    });
    if (!rule) return { ...DEFAULT_RULE };
    const r = rule.get ? rule.get({ plain: true }) : rule;
    return {
      ...DEFAULT_RULE,
      ...r,
      price_tolerance_pct: r.price_tolerance_pct ?? DEFAULT_RULE.price_tolerance_pct,
      price_tolerance_amount: r.price_tolerance_amount ?? DEFAULT_RULE.price_tolerance_amount,
      qty_tolerance_pct: r.qty_tolerance_pct ?? DEFAULT_RULE.qty_tolerance_pct
    };
  }

  /**
   * Suggests the PO line for each bill line: the only PO line, or the best name match (a matching
   * rate helps). Each PO line is used once where possible. Returns po_item_id (or null) per line.
   */
  suggestPoLines(poItems, lines) {
    const items = (poItems || []).map((i) => ({ id: i.id, name: i.item_name, price: toNumber(i.unit_price) }));
    if (!items.length) return (lines || []).map(() => null);
    if (items.length === 1) {
      // One PO line: link the bill's only line, or lines that look like it (name or rate). A freight or
      // packing line on the bill is left unlinked instead of being checked against the item's price.
      const it = items[0];
      return lines.map((l) => {
        const rate = l.unit_price != null ? toNumber(l.unit_price) : null;
        const rateMatch = rate && it.price && Math.abs(rate - it.price) <= it.price * 0.05;
        return lines.length === 1 || rateMatch || similarity(l.description, it.name) >= 0.2 ? it.id : null;
      });
    }
    const pairs = [];
    lines.forEach((l, li) => items.forEach((it) => {
      let score = similarity(l.description, it.name);
      const rate = l.unit_price != null ? toNumber(l.unit_price) : null;
      if (rate && it.price && Math.abs(rate - it.price) <= it.price * 0.02) score += 0.3;
      if (score >= 0.34) pairs.push({ li, id: it.id, score });
    }));
    pairs.sort((a, b) => b.score - a.score);
    const out = lines.map(() => null);
    const used = new Set();
    pairs.forEach((p) => { if (out[p.li] == null && !used.has(p.id)) { out[p.li] = p.id; used.add(p.id); } });
    pairs.forEach((p) => { if (out[p.li] == null) out[p.li] = p.id; }); // a PO line billed on two bill lines
    return out;
  }

  /**
   * The match itself, on plain data, so it can run before a bill is saved (review form, auto-submit)
   * and after (the stored match record).
   * @param {{ clientId, poId, invoiceBase: number, lines?: Array<{line_no?, description, quantity, unit_price, amount, po_item_id}>, excludeInvoiceId?: number }} input
   */
  async evaluate({ clientId, poId, invoiceBase, lines = [], excludeInvoiceId = null }) {
    const po = poId ? await PurchaseOrder.findOne({ where: { id: poId, ...(clientId ? { client_id: clientId } : {}) } }) : null;
    const rule = await this.getActiveRule(clientId || po?.client_id);
    const base = { po_id: po?.id || null, qty_variance: 0, amount_variance: 0, tolerance_pct: toNumber(rule.tolerance_pct) };
    if (!po) return { ...base, status: 'BLOCKED', issues: ['No purchase order linked'], blocked_reason: 'No purchase order linked', details: null };

    const appliesTo = String(rule.applies_to || 'BOTH');
    const checkQty = appliesTo === 'QTY' || appliesTo === 'BOTH';
    const checkAmount = appliesTo === 'AMOUNT' || appliesTo === 'BOTH';
    const poItems = await PurchaseOrderItem.findAll({ where: { po_id: po.id } });
    const byId = new Map(poItems.map((i) => [i.id, i]));

    // Received per PO line: the PO line's received quantity, or the receipts themselves if larger,
    // less what was returned to the vendor.
    const grns = await GRN.findAll({ where: { po_id: po.id, client_id: po.client_id, status: { [Op.ne]: 'REJECTED' } }, attributes: ['id'] });
    const grnIds = grns.map((g) => g.id);
    const fromGrn = new Map();
    if (grnIds.length) {
      const grnItems = await GRNItem.findAll({ where: { grn_id: { [Op.in]: grnIds } }, attributes: ['id', 'po_item_id', 'accepted_quantity', 'received_quantity'] });
      grnItems.forEach((gi) => fromGrn.set(gi.po_item_id, (fromGrn.get(gi.po_item_id) || 0) + toNumber(gi.accepted_quantity ?? gi.received_quantity)));
    }
    const returned = new Map();
    if (grnIds.length) {
      const rets = await PurchaseReturnItem.findAll({
        attributes: ['po_item_id', 'grn_item_id', 'quantity'],
        include: [{ model: PurchaseReturn, as: 'purchaseReturn', attributes: [], where: { grn_id: { [Op.in]: grnIds } } }]
      }).catch(() => []);
      for (const r of rets) {
        let itemId = r.po_item_id;
        if (!itemId && r.grn_item_id) itemId = (await GRNItem.findByPk(r.grn_item_id, { attributes: ['po_item_id'] }))?.po_item_id;
        if (itemId) returned.set(itemId, (returned.get(itemId) || 0) + toNumber(r.quantity));
      }
    }
    const received = new Map(poItems.map((i) => [i.id, Math.max(0, Math.max(toNumber(i.received_quantity), fromGrn.get(i.id) || 0) - (returned.get(i.id) || 0))]));
    const receivedValue = round2(poItems.reduce((s, i) => s + received.get(i.id) * toNumber(i.unit_price), 0));

    // Already billed on this PO by other bills: value (all bills) and quantity per line (bills with lines).
    const others = { po_id: po.id, client_id: po.client_id, status: { [Op.ne]: 'REJECTED' }, ...(excludeInvoiceId ? { id: { [Op.ne]: excludeInvoiceId } } : {}) };
    const billedValue = round2(toNumber(await Invoice.sum('base_amount', { where: others })));
    const otherInvoiceIds = (await Invoice.findAll({ where: others, attributes: ['id'] })).map((i) => i.id);
    const billedQty = new Map();
    if (otherInvoiceIds.length) {
      const billedLines = await ApInvoiceLine.findAll({ where: { invoice_id: { [Op.in]: otherInvoiceIds }, po_item_id: { [Op.ne]: null } }, attributes: ['po_item_id', 'quantity'] });
      billedLines.forEach((l) => billedQty.set(l.po_item_id, (billedQty.get(l.po_item_id) || 0) + toNumber(l.quantity)));
    }
    const openValue = round2(receivedValue - billedValue);

    const issues = [];
    let qtyVariance = 0;
    const invoiceAmount = round2(invoiceBase);
    if (receivedValue <= 0) {
      issues.push(`Nothing received yet on PO ${po.po_number} (no goods receipt or approved service entry)`);
    } else if (checkAmount) {
      const allowance = Math.max(Math.max(openValue, 0) * (toNumber(rule.tolerance_pct) / 100), toNumber(rule.tolerance_amount));
      if (invoiceAmount > openValue + allowance + 0.5) {
        issues.push(`Bill ${inr(invoiceAmount)} before GST is more than what was received and not yet billed on PO ${po.po_number} (${inr(Math.max(openValue, 0))})`);
      }
    }

    // Line by line
    const usedNow = new Map();
    const lineResults = [];
    let unlinked = 0;
    lines.forEach((l, idx) => {
      const n = l.line_no || idx + 1;
      const label = `Line ${n}${l.description ? ` (${String(l.description).slice(0, 40)})` : ''}`;
      const amount = toNumber(l.amount);
      if (!l.po_item_id) {
        if (amount > 0) unlinked += 1;
        lineResults.push({ line_no: n, description: l.description, po_item_id: null, issues: [] });
        return;
      }
      const item = byId.get(Number(l.po_item_id));
      const result = { line_no: n, description: l.description, po_item_id: Number(l.po_item_id), item_name: item?.item_name || null, issues: [] };
      if (!item) {
        result.issues.push(`${label} is linked to a line that is not on PO ${po.po_number}`);
      } else {
        const qty = l.quantity != null && l.quantity !== '' ? toNumber(l.quantity) : null;
        const open = received.get(item.id) - (billedQty.get(item.id) || 0) - (usedNow.get(item.id) || 0);
        result.qty = qty;
        result.open_qty = round2(open);
        result.unit_price = l.unit_price != null && l.unit_price !== '' ? toNumber(l.unit_price) : null;
        result.po_price = toNumber(item.unit_price);
        if (qty != null) {
          usedNow.set(item.id, (usedNow.get(item.id) || 0) + qty);
          const allowedQty = Math.max(open, 0) * (1 + toNumber(rule.qty_tolerance_pct) / 100);
          if (checkQty && receivedValue > 0 && qty > allowedQty + 1e-6) { // nothing received at all is reported once, above
            qtyVariance += qty - Math.max(open, 0);
            result.issues.push(`${label}: billed ${qtyText(qty)}, but only ${qtyText(Math.max(open, 0))} received and not yet billed`);
          }
        }
        if (checkAmount && result.unit_price != null && result.po_price > 0 && result.unit_price > result.po_price) {
          const q = qty ?? 1;
          const excess = (result.unit_price - result.po_price) * q;
          const byPct = result.po_price * q * (toNumber(rule.price_tolerance_pct) / 100);
          const byAmount = toNumber(rule.price_tolerance_amount);
          const allowed = byAmount > 0 ? Math.min(byPct, byAmount) : byPct;
          if (excess > allowed + 0.005) {
            const pct = Math.round(((result.unit_price - result.po_price) / result.po_price) * 1000) / 10;
            result.issues.push(`${label}: rate ${inr(result.unit_price)} vs PO ${inr(result.po_price)} (+${pct}%)`);
          }
        }
      }
      issues.push(...result.issues);
      lineResults.push(result);
    });

    const status = issues.length ? (receivedValue <= 0 ? 'BLOCKED' : 'TOLERANCE_BREACH') : 'MATCHED';
    return {
      ...base,
      status,
      issues,
      blocked_reason: issues.length ? issues.join('; ') : null,
      qty_variance: round2(qtyVariance).toFixed(2),
      amount_variance: round2(Math.max(0, invoiceAmount - openValue)).toFixed(2),
      details: {
        received_value: receivedValue,
        billed_before: billedValue,
        open_value: openValue,
        invoice_base: invoiceAmount,
        lines_checked: lineResults.filter((r) => r.po_item_id).length,
        lines_unlinked: unlinked,
        rule: {
          total_pct: toNumber(rule.tolerance_pct), total_amount: toNumber(rule.tolerance_amount),
          price_pct: toNumber(rule.price_tolerance_pct), price_amount: toNumber(rule.price_tolerance_amount), qty_pct: toNumber(rule.qty_tolerance_pct)
        },
        lines: lineResults
      }
    };
  }

  /** The match for a saved invoice. */
  async runMatch(invoiceId, clientId) {
    const invoice = await Invoice.findOne({ where: { id: invoiceId, ...(clientId ? { client_id: clientId } : {}) } });
    if (!invoice) {
      return { invoice_id: invoiceId, status: 'BLOCKED', blocked_reason: 'Invoice not found', qty_variance: 0, amount_variance: 0, tolerance_pct: 0 };
    }
    const ids = { invoice_id: invoice.id, client_id: invoice.client_id, grn_id: invoice.grn_id || null, ses_id: invoice.ses_id || null };
    // A bill raised from a service entry sheet needs that sheet approved.
    if (invoice.ses_id) {
      const ses = await ServiceEntrySheet.findOne({ where: { id: invoice.ses_id, client_id: invoice.client_id } });
      if (!ses || Number(ses.po_id) !== Number(invoice.po_id)) return { ...ids, po_id: invoice.po_id, status: 'BLOCKED', blocked_reason: 'Missing PO/service entry sheet', qty_variance: 0, amount_variance: 0, tolerance_pct: 0 };
      if (ses.status !== 'APPROVED') return { ...ids, po_id: invoice.po_id, status: 'BLOCKED', blocked_reason: `Service entry sheet ${ses.ses_number} is not approved (${ses.status})`, qty_variance: 0, amount_variance: 0, tolerance_pct: 0 };
    }
    const lines = await ApInvoiceLine.findAll({ where: { invoice_id: invoice.id }, order: [['line_no', 'ASC']] });
    const invoiceBase = invoice.base_amount != null ? toNumber(invoice.base_amount) : toNumber(invoice.total_amount) - toNumber(invoice.gst_amount);
    const result = await this.evaluate({
      clientId: invoice.client_id,
      poId: invoice.po_id,
      invoiceBase,
      lines: lines.map((l) => ({ line_no: l.line_no, description: l.description, quantity: l.quantity, unit_price: l.unit_price, amount: l.amount, po_item_id: l.po_item_id })),
      excludeInvoiceId: invoice.id
    });
    return { ...ids, ...result, po_id: result.po_id || invoice.po_id };
  }

  async createOrUpdateMatch(invoiceId, clientId) {
    const match = await this.runMatch(invoiceId, clientId);
    if (!match.po_id) return match; // nothing to record without a PO
    const payload = {
      po_id: match.po_id,
      grn_id: match.grn_id || null,
      ses_id: match.ses_id || null,
      invoice_id: match.invoice_id,
      client_id: match.client_id || clientId,
      status: match.status,
      qty_variance: match.qty_variance || 0,
      amount_variance: match.amount_variance || 0,
      tolerance_pct: match.tolerance_pct || 0,
      blocked_reason: match.blocked_reason || null,
      details: match.details || null
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

  /** Invoice fields for a match result: a failed match is an exception with payment blocked. */
  invoiceFieldsFor(match) {
    const matched = match && match.status === 'MATCHED';
    return {
      matching_status: matched ? 'MATCHED' : 'MISMATCHED',
      status: matched ? 'UNPAID' : 'EXCEPTION',
      payment_blocked: !matched,
      payment_block_reason: matched ? null : ((match && match.blocked_reason) || '3-way match variance'),
      exception_status: matched ? 'NONE' : 'OPEN',
      matching_exception_details: matched ? null : ((match && match.blocked_reason) || null),
      // Who acts on the exception next (price -> Procurement, quantity -> Warehouse, else Finance)
      ...require('./billApproval.service').routingFor(match)
    };
  }

  /**
   * After goods or services are received on a PO: re-checks its bills that are open exceptions
   * because of the match, so a bill that arrived before the goods clears by itself. Bills with
   * payments, or exceptions Finance already handled, are left alone.
   */
  async rematchOpenForPo(poId, clientId) {
    const invoices = await Invoice.findAll({
      where: { po_id: poId, ...(clientId ? { client_id: clientId } : {}), status: 'EXCEPTION', matching_status: 'MISMATCHED', exception_status: 'OPEN' }
    });
    let cleared = 0;
    for (const inv of invoices) {
      if (toNumber(inv.paid_amount) > 0) continue;
      const m = await this.createOrUpdateMatch(inv.id, inv.client_id);
      const fields = this.invoiceFieldsFor(m);
      if (m.status !== 'MATCHED' && inv.exception_reviewed_at) {
        // Still an exception, and someone already reviewed it: keep their review, update the reasons only.
        await inv.update({ payment_block_reason: fields.payment_block_reason, matching_exception_details: fields.matching_exception_details });
      } else {
        await inv.update(fields);
      }
      if (m.status === 'MATCHED') cleared += 1;
    }
    return { checked: invoices.length, cleared };
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
