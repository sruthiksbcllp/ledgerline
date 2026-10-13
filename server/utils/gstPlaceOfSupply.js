'use strict';
/**
 * CR-P03 — GST place-of-supply split (pure). Reproduces the prior inline logic but
 * supply state is caller-supplied (property-level when flag on, else org env).
 * INTRA (states present & equal) -> CGST + SGST (½/½, sgst absorbs rounding remainder).
 * INTER / unknown -> IGST. Total (cgst+sgst+igst) always equals gstAmount.
 */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function determineGstSplit({ vendorStateCode, supplyStateCode, gstAmount } = {}) {
  const gst = Number(gstAmount || 0);
  const v = String(vendorStateCode || '').trim().slice(0, 2);
  const s = String(supplyStateCode || '').trim().slice(0, 2);
  const determined = !!(v && s);
  const intra = determined && v === s;
  if (intra) {
    const cgst = round2(gst / 2);
    return { type: 'INTRA', determined, cgst_amount: cgst, sgst_amount: round2(gst - cgst), igst_amount: 0 };
  }
  return { type: 'INTER', determined, cgst_amount: 0, sgst_amount: 0, igst_amount: round2(gst) };
}
module.exports = { determineGstSplit, round2 };
