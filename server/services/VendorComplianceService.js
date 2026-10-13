'use strict';

const { Op } = require('sequelize');
const { Vendor, TDSNonFiler, Invoice } = require('../models');

const daysTo = (value) => {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.ceil((dt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

class VendorComplianceService {
  async checkVendorExpiry(vendorId) {
    const vendor = await Vendor.findByPk(vendorId);
    if (!vendor) return null;
    const gstDays = daysTo(vendor.gst_expiry_date);
    const msmeDays = daysTo(vendor.msme_expiry_date);
    return {
      vendorId: vendor.id,
      gst: { days: gstDays, expired: gstDays != null && gstDays < 0, expiringSoon: gstDays != null && gstDays >= 0 && gstDays <= 30 },
      msme: { days: msmeDays, expired: msmeDays != null && msmeDays < 0, expiringSoon: msmeDays != null && msmeDays >= 0 && msmeDays <= 30 }
    };
  }

  async computeRiskScore(vendorId) {
    const vendor = await Vendor.findByPk(vendorId);
    if (!vendor) return null;
    let score = 100;
    if (vendor.gstin_status === 'INVALID_FORMAT') score -= 20;
    const expiry = await this.checkVendorExpiry(vendorId);
    if (expiry?.gst?.expiringSoon) score -= 15;
    if (expiry?.gst?.expired) score -= 20;
    if (expiry?.msme?.expiringSoon) score -= 10;
    if (vendor.pan_number) {
      const nf = await TDSNonFiler.findOne({ where: { pan: String(vendor.pan_number).toUpperCase() } });
      if (nf) score -= 30;
    }
    const blocked = await Invoice.count({ where: { vendor_id: vendor.id, payment_blocked: true, client_id: vendor.client_id } });
    if (blocked > 0) score -= 25;
    score = Math.max(0, score);
    await vendor.update({ compliance_score: score, compliance_last_checked: new Date() });
    return score;
  }

  async runAllVendorChecks(clientId) {
    const where = clientId ? { client_id: clientId } : {};
    const vendors = await Vendor.findAll({ where });
    for (const vendor of vendors) {
      try {
        await this.computeRiskScore(vendor.id);
      } catch (e) {
        console.error(`[VendorCompliance] skipping vendor ${vendor.id}:`, e.message);
      }
    }
    return vendors.length;
  }
}

module.exports = new VendorComplianceService();

