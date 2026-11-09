'use strict';

/**
 * TDS sections, Income-tax Act 2025 (in force 1 April 2026), rates for FY 2026-27.
 * `section` stays the old 1961-Act number: it is the key saved on vendors and invoices and the
 * name users still recognise; `act2025` is the new reference and `payment_code` the challan code.
 * threshold_basis YEAR = vendor's total in the financial year, MONTH = in the calendar month.
 * single_threshold: one payment above it attracts TDS even below the yearly total (194C).
 * excess_only: TDS only on the part above the threshold (194Q).
 * Payment codes come from published tables, not the CBDT notification: confirm before filing.
 */
module.exports = [
  { section: '194A', act2025: '393(1) Sl. 5(iii)', payment_code: '1022', description: 'Interest (other than securities)', threshold: 10000, individual: 10, company: 10 },
  { section: '194C', act2025: '393(1) Sl. 6(i)', payment_code: '1023 / 1024', description: 'Payment to contractors', threshold: 100000, single_threshold: 30000, individual: 1, company: 2 },
  { section: '194D', act2025: '393(1) Sl. 1(i)', payment_code: '1005', description: 'Insurance commission', threshold: 20000, individual: 2, company: 10 },
  { section: '194H', act2025: '393(1) Sl. 1(ii)', payment_code: '1006', description: 'Commission or brokerage', threshold: 20000, individual: 2, company: 2 },
  { section: '194I(a)', act2025: '393(1) Sl. 2(ii)', payment_code: '1008', description: 'Rent - plant/machinery/equipment', threshold: 50000, threshold_basis: 'MONTH', individual: 2, company: 2 },
  { section: '194I', act2025: '393(1) Sl. 2(ii)', payment_code: '1009', description: 'Rent - land/building/furniture', threshold: 50000, threshold_basis: 'MONTH', individual: 10, company: 10 },
  { section: '194J(a)', act2025: '393(1) Sl. 6(iii)', payment_code: '1026', description: 'Fees for technical services', threshold: 50000, individual: 2, company: 2 },
  { section: '194J', act2025: '393(1) Sl. 6(iii)', payment_code: '1027', description: 'Fees for professional services', threshold: 50000, individual: 10, company: 10 },
  { section: '194Q', act2025: '393(1) Sl. 8(ii)', payment_code: '1031', description: 'Purchase of goods', threshold: 5000000, excess_only: true, individual: 0.1, company: 0.1 },
  { section: '194R', act2025: '393(1) Sl. 8(iv)', payment_code: '1033', description: 'Benefits/perquisites to business', threshold: 20000, individual: 10, company: 10 }
];
