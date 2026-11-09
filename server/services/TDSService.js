'use strict';

const { Op } = require('sequelize');
const { Invoice, Vendor, TDSComputation, TDSSection, TDSNonFiler } = require('../models');
const defaultRates = require('../utils/tdsRates');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Indian financial year (1 April – 31 March) containing the date. */
function financialYear(date) {
  const d = date ? new Date(date) : new Date();
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** Calendar month containing the date (rent thresholds are per month). */
function calendarMonth(date) {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${last}` };
}

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
      act2025_ref: r.act2025,
      payment_code: r.payment_code,
      single_threshold: r.single_threshold || null,
      threshold_basis: r.threshold_basis || 'YEAR',
      excess_only: Boolean(r.excess_only),
      is_active: true
    })));
  }

  async checkNonFiler(pan) {
    if (!pan) return false;
    const found = await TDSNonFiler.findOne({ where: { pan: String(pan).toUpperCase() } });
    return Boolean(found);
  }

  /**
   * TDS for one invoice (AP JE reference §2): only when a section applies (none = no TDS), on the
   * value excluding GST, at the invoice's rate or the vendor's. Nil while the vendor's taxable
   * amount under that section stays within the threshold, counted over the financial year (or the
   * calendar month for rent); one payment above the single-payment limit (194C) attracts TDS anyway.
   * For 194Q only the part above the threshold is taxed. A section 206AB non-filer pays at least
   * 5% / twice the rate.
   */
  async calculate({ clientId, vendor, sectionCode, ratePercent, baseAmount, invoiceDate, excludeInvoiceId = null }) {
    if (!sectionCode) return { section: null, rate: 0, amount: 0, is206ab: false };
    await this.seedDefaultRates();
    const section = await TDSSection.findOne({ where: { section_code: sectionCode, is_active: true } });
    let rate = Number(ratePercent ?? vendor?.tds_rate_percent ?? section?.company_rate ?? 0);
    const base = round2(baseAmount);
    let taxable = base;

    const threshold = Number(section?.threshold_amount || 0);
    if (threshold > 0 && vendor?.id) {
      const period = section?.threshold_basis === 'MONTH' ? calendarMonth(invoiceDate) : financialYear(invoiceDate);
      const earlier = Number(await Invoice.sum('base_amount', {
        where: {
          client_id: clientId, vendor_id: vendor.id, tds_section_code: sectionCode,
          status: { [Op.ne]: 'REJECTED' }, invoice_date: { [Op.between]: [period.from, `${period.to} 23:59:59`] },
          ...(excludeInvoiceId ? { id: { [Op.ne]: excludeInvoiceId } } : {})
        }
      }) || 0);
      const single = Number(section?.single_threshold || 0);
      const overSingle = single > 0 && base > single;
      if (earlier + base <= threshold && !overSingle) rate = 0;
      else if (section?.excess_only) taxable = round2(Math.min(base, earlier + base - threshold));
    }

    const is206ab = rate > 0 && await this.checkNonFiler(vendor?.pan_number);
    if (is206ab) rate = Math.max(5, rate * 2);
    return { section: sectionCode, rate, amount: round2(taxable * rate / 100), is206ab };
  }

  /**
   * Record the TDS computation (for TDS returns) from the invoice, whose section, rate and amount
   * were worked out by calculate() when it was booked. Invoices without a section have no TDS.
   */
  async computeTDS(invoiceId, clientId) {
    const invoice = await Invoice.findOne({ where: { id: invoiceId, client_id: clientId } });
    if (!invoice || !invoice.tds_section_code) return null;
    const vendor = await Vendor.findOne({ where: { id: invoice.vendor_id, client_id: clientId } });
    if (!vendor) return null;
    const payload = {
      invoice_id: invoice.id,
      vendor_id: vendor.id,
      client_id: clientId,
      section_code: invoice.tds_section_code,
      tds_rate: Number(invoice.tds_rate_percent || 0),
      tds_amount: round2(invoice.tds_amount),
      is_206ab_applicable: await this.checkNonFiler(vendor.pan_number),
      status: 'COMPUTED'
    };
    const existing = await TDSComputation.findOne({ where: { invoice_id: invoice.id, client_id: clientId } });
    return existing ? existing.update(payload) : TDSComputation.create(payload);
  }
}

module.exports = new TDSService();
