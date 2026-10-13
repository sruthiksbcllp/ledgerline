'use strict';

const { Invoice, Vendor, TDSComputation, TDSSection, TDSNonFiler } = require('../models');
const defaultRates = require('../utils/tdsRates');

class TDSService {
  async seedDefaultRates() {
    const count = await TDSSection.count();
    if (count > 0) return;
    await TDSSection.bulkCreate(defaultRates.map((r) => ({
      section_code: r.section,
      description: r.description,
      threshold_amount: r.threshold,
      individual_rate: r.individual,
      company_rate: r.company,
      is_active: true
    })));
  }

  async checkNonFiler(pan) {
    if (!pan) return false;
    const found = await TDSNonFiler.findOne({ where: { pan: String(pan).toUpperCase() } });
    return Boolean(found);
  }

  async computeTDS(invoiceId, clientId) {
    await this.seedDefaultRates();
    const invoice = await Invoice.findOne({ where: { id: invoiceId, client_id: clientId } });
    if (!invoice) return null;
    const vendor = await Vendor.findOne({ where: { id: invoice.vendor_id, client_id: clientId } });
    if (!vendor) return null;

    const sectionCode = vendor.tds_section_code || '194C';
    const section = await TDSSection.findOne({ where: { section_code: sectionCode, is_active: true } });
    const baseAmount = Number(invoice.invoice_amount || invoice.total_amount || 0);

    let rate = Number(vendor.tds_rate_percent || section?.company_rate || 2);
    const threshold = Number(section?.threshold_amount || 0);
    if (baseAmount <= threshold) rate = 0;

    const is206ab = await this.checkNonFiler(vendor.pan_number);
    if (is206ab) {
      const doubled = rate * 2;
      rate = Math.max(5, doubled);
    }

    const amount = Number((baseAmount * (rate / 100)).toFixed(2));
    const payload = {
      invoice_id: invoice.id,
      vendor_id: vendor.id,
      client_id: clientId,
      section_code: sectionCode,
      tds_rate: rate,
      tds_amount: amount,
      is_206ab_applicable: is206ab,
      status: 'COMPUTED'
    };
    const existing = await TDSComputation.findOne({ where: { invoice_id: invoice.id, client_id: clientId } });
    const record = existing ? await existing.update(payload) : await TDSComputation.create(payload);
    await invoice.update({ tds_amount: amount, tds_rate_percent: rate, tds_section_code: sectionCode });
    return record;
  }
}

module.exports = new TDSService();

