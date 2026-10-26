const DEFAULT_TOLERANCES = {
  amountPercent: Number(process.env.THREE_WAY_AMOUNT_TOLERANCE_PCT || 5),
  unitPricePercent: Number(process.env.THREE_WAY_UNIT_PRICE_TOLERANCE_PCT || 5),
  quantityPercent: Number(process.env.THREE_WAY_QTY_TOLERANCE_PCT || 0)
};

exports.validate3WayMatch = async (po_id, grn_id, invoice_amount, options = {}) => {
  const { PurchaseOrder, GRN, PurchaseOrderItem, GRNItem } = require('../models');
  const tolerances = {
    amountPercent: Number(options.amountPercent ?? DEFAULT_TOLERANCES.amountPercent),
    unitPricePercent: Number(options.unitPricePercent ?? DEFAULT_TOLERANCES.unitPricePercent),
    quantityPercent: Number(options.quantityPercent ?? DEFAULT_TOLERANCES.quantityPercent)
  };

  const po = await PurchaseOrder.findByPk(po_id, { include: [{ model: PurchaseOrderItem, as: 'items' }] });
  const grn = await GRN.findByPk(grn_id, { include: [{ model: GRNItem, as: 'GRNItems' }] });

  if (!po || !grn) {
    return { matched: false, error: 'Invalid PO or GRN reference', mismatches: ['Invalid PO or GRN reference'], tolerances };
  }

  if (Number(grn.po_id) !== Number(po.id)) {
    return { matched: false, error: 'GRN does not belong to the selected PO', mismatches: ['GRN does not belong to the selected PO'], tolerances };
  }

  const poItems = Array.isArray(po.items) ? po.items : [];
  const grnItems = Array.isArray(grn.GRNItems) ? grn.GRNItems : [];
  const poById = new Map(poItems.map((i) => [String(i.id), i]));
  const mismatches = [];
  let acceptedValueTotal = 0;
  let hasGateQualityException = false;

  for (const g of grnItems) {
    const poItem = poById.get(String(g.po_item_id));
    if (!poItem) {
      mismatches.push(`GRN item ${g.item_name || g.id} has no linked PO item`);
      continue;
    }

    const poQty = Number(poItem.quantity || 0);
    const grnQty = Number(g.accepted_quantity ?? g.received_quantity ?? g.quantity ?? 0);
    const rejectedQty = Number(g.rejected_quantity || 0);
    const damagedQty = Number(g.damaged_quantity || 0);
    const poUnit = Number(poItem.unit_price || 0);
    const grnUnit = Number(g.unit_price || poUnit);
    const qualityBucket = String(g.quality_bucket || '').toUpperCase();
    acceptedValueTotal += grnQty * poUnit;

    const qtyDiffPct = poQty > 0 ? (Math.abs(grnQty - poQty) / poQty) * 100 : 0;
    const unitDiffPct = poUnit > 0 ? (Math.abs(grnUnit - poUnit) / poUnit) * 100 : 0;

    if (rejectedQty > 0 || damagedQty > 0 || ['REJECTED', 'DAMAGED', 'MIXED'].includes(qualityBucket)) {
      hasGateQualityException = true;
      mismatches.push(
        `Quality exception for ${poItem.item_name}: accepted ${grnQty}, rejected ${rejectedQty}, damaged ${damagedQty}`
      );
    }
    if (qtyDiffPct > tolerances.quantityPercent) {
      mismatches.push(`Quantity mismatch for ${poItem.item_name}: PO ${poQty}, accepted GRN ${grnQty} (>${tolerances.quantityPercent}% tolerance)`);
    }
    if (unitDiffPct > tolerances.unitPricePercent) {
      mismatches.push(`Unit price mismatch for ${poItem.item_name}: PO Rs.${poUnit}, GRN Rs.${grnUnit} (>${tolerances.unitPricePercent}% tolerance)`);
    }
  }

  const poTotal = Number(po.total_amount || 0);
  const invTotal = Number(invoice_amount || 0);
  const comparisonTotal = acceptedValueTotal > 0 && acceptedValueTotal < poTotal ? acceptedValueTotal : poTotal;
  const allowedDiff = comparisonTotal * (tolerances.amountPercent / 100);
  const amountDiff = Math.abs(invTotal - comparisonTotal);
  if (amountDiff > allowedDiff) {
    mismatches.push(`Invoice amount Rs.${invTotal} vs accepted/PO value Rs.${comparisonTotal} exceeds ${tolerances.amountPercent}% tolerance`);
  }

  return {
    matched: mismatches.length === 0,
    error: mismatches[0] || null,
    mismatches,
    tolerances,
    metrics: {
      po_total: poTotal,
      accepted_value_total: acceptedValueTotal,
      has_gate_quality_exception: hasGateQualityException,
      invoice_total: invTotal,
      amount_diff: amountDiff,
      amount_allowed_diff: allowedDiff
    }
  };
};

/**
 * 3-way match for a service invoice: PO <-> approved Service Entry Sheet <-> invoice.
 * The SES must belong to the PO and be APPROVED; the invoice's pre-tax amount must agree with the
 * SES value (accepted quantity x PO price) within the amount tolerance.
 */
exports.validateSesMatch = async (po_id, ses_id, invoice_base_amount, options = {}) => {
  const { PurchaseOrder, ServiceEntrySheet } = require('../models');
  const amountPercent = Number(options.amountPercent ?? DEFAULT_TOLERANCES.amountPercent);
  const tolerances = { amountPercent };
  const fail = (msg) => ({ matched: false, error: msg, mismatches: [msg], tolerances });

  const [po, ses] = await Promise.all([PurchaseOrder.findByPk(po_id), ServiceEntrySheet.findByPk(ses_id)]);
  if (!po || !ses) return fail('Invalid PO or service entry sheet reference');
  if (Number(ses.po_id) !== Number(po.id)) return fail('Service entry sheet does not belong to the selected PO');
  if (ses.status !== 'APPROVED') return fail(`Service entry sheet ${ses.ses_number} is not approved yet (${ses.status})`);

  const sesValue = Number(ses.total_value || 0);
  const invAmount = Number(invoice_base_amount || 0);
  const amountDiff = Math.abs(invAmount - sesValue);
  const allowedDiff = sesValue * (amountPercent / 100);
  const mismatches = amountDiff > allowedDiff
    ? [`Invoice amount Rs.${invAmount} (before tax) vs approved service value Rs.${sesValue} exceeds ${amountPercent}% tolerance`]
    : [];

  return {
    matched: mismatches.length === 0,
    error: mismatches[0] || null,
    mismatches,
    tolerances,
    metrics: { ses_value: sesValue, invoice_base_amount: invAmount, amount_diff: amountDiff, amount_allowed_diff: allowedDiff }
  };
};
