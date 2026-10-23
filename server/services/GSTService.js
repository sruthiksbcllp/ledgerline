'use strict';
const { validateFormat } = require('../utils/gstValidator');
const gstinCache = require('../utils/gstinCache');
const { FeatureToggle } = require('../models');

class GSTService {
  async validateVendorGSTIN(gstin, clientId) {
    const formatResult = validateFormat(gstin);
    if (!formatResult.valid) return { valid: false, status: 'INVALID_FORMAT', error: formatResult.error, gstin };

    const liveEnabled = await this.isLiveValidationEnabled(clientId);
    if (!liveEnabled) {
      return {
        valid: true,
        status: 'FORMAT_VALID',
        gstin: formatResult.gstin,
        state: formatResult.state,
        pan: formatResult.pan,
        liveValidation: false,
        note: 'Live GSTIN status check not enabled for this account'
      };
    }

    const cached = gstinCache.get(gstin);
    if (cached) return { ...cached, fromCache: true };

    try {
      const result = await this.callGSTAPI(gstin);
      gstinCache.set(gstin, result);
      return result;
    } catch {
      return {
        valid: true,
        status: 'API_UNAVAILABLE',
        gstin: formatResult.gstin,
        state: formatResult.state,
        warning: 'Live validation temporarily unavailable — format check passed'
      };
    }
  }

  async isLiveValidationEnabled(clientId) {
    try {
      const toggle = await FeatureToggle.findOne({ where: { feature_key: 'GST_VALIDATION', client_id: clientId } });
      return toggle ? toggle.is_enabled : false;
    } catch {
      return false;
    }
  }

  async callGSTAPI(gstin) {
    const formatResult = validateFormat(gstin);
    return { valid: true, status: 'FORMAT_VALID', gstin: formatResult.gstin, state: formatResult.state, pan: formatResult.pan, liveValidation: false };
  }

  validateInvoiceGST(invoice) {
    const errors = [];
    if (!invoice.vendor_gstin) errors.push('Vendor GSTIN missing on invoice');
    if (!invoice.buyer_gstin) errors.push('Buyer GSTIN missing on invoice');
    if (invoice.vendor_gstin && invoice.buyer_gstin) {
      const vendorState = invoice.vendor_gstin.substring(0, 2);
      const buyerState = invoice.buyer_gstin.substring(0, 2);
      const isInterState = vendorState !== buyerState;
      if (isInterState && Number(invoice.cgst_amount || 0) > 0) errors.push('CGST/SGST applied on inter-state supply — should be IGST');
      if (!isInterState && Number(invoice.igst_amount || 0) > 0) errors.push('IGST applied on intra-state supply — should be CGST/SGST');
    }
    return { valid: errors.length === 0, errors };
  }
}
module.exports = new GSTService();

