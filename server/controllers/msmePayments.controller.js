'use strict';

/**
 * MSME 45-day rule. Micro and small enterprises must be paid within the days agreed in writing,
 * at most 45 days (15 days when nothing was agreed) — MSMED Act s.15. Under Income-tax 43B(h)
 * an amount paid later is allowed as an expense only in the year it is actually paid.
 * The clock starts on the invoice date here (the acceptance date in the Act).
 */
const { Op } = require('sequelize');
const { Invoice, Vendor } = require('../models');
const { getClientId } = require('../utils/tenantFilter');

const DAY = 86400000;
const COVERED = ['MICRO', 'SMALL'];
const DUE_SOON_DAYS = 7;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const dateOnly = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

/** Days allowed for a vendor: the agreed days capped at 45, or 15 when none were agreed. */
const allowedDays = (vendor) => {
  const agreed = Number(vendor.msme_agreed_days || 0);
  return agreed > 0 ? Math.min(agreed, 45) : 15;
};

/** What is still owed on the invoice after TDS, payments, advance, returns and discount. */
const balanceOf = (inv) => (inv.status === 'PAID' ? 0 : Math.max(0, round2(
  Number(inv.total_amount || 0) - Number(inv.tds_amount || 0) - Number(inv.paid_amount || 0)
  - Number(inv.advance_adjusted || 0) - Number(inv.returns_credit || 0) - Number(inv.discount_received || 0)
)));

function financialYearStart(today) {
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return new Date(y, 3, 1);
}

exports.report = async (req, res) => {
  const clientId = getClientId(req) || req.user?.client_id;
  if (!clientId) return res.status(400).json({ success: false, message: 'Select a company first' });

  const vendors = await Vendor.findAll({
    where: { client_id: clientId, msme_category: { [Op.in]: COVERED } },
    attributes: ['id', 'vendor_name', 'msme_category', 'udyam_number', 'msme_agreed_days', 'email', 'phone']
  });
  const notClassified = await Vendor.count({ where: { client_id: clientId, msme_category: null, msme_expiry_date: { [Op.ne]: null } } });
  if (!vendors.length) {
    return res.json({ success: true, data: { rows: [], summary: { overdue: { count: 0, amount: 0 }, due_soon: { count: 0, amount: 0 }, paid_late: { count: 0, amount: 0 }, msme_vendors: 0 }, not_classified: notClassified } });
  }

  const byId = new Map(vendors.map((v) => [v.id, v]));
  const today = dateOnly(new Date());
  const fyStart = financialYearStart(today);
  const invoices = await Invoice.findAll({
    where: {
      client_id: clientId,
      vendor_id: { [Op.in]: [...byId.keys()] },
      status: { [Op.ne]: 'REJECTED' },
      // Everything still open, plus this financial year's paid invoices (to catch late payments).
      [Op.or]: [{ status: { [Op.ne]: 'PAID' } }, { payment_date: { [Op.gte]: fyStart } }, { invoice_date: { [Op.gte]: fyStart } }]
    },
    attributes: ['id', 'invoice_number', 'vendor_id', 'invoice_date', 'total_amount', 'tds_amount', 'paid_amount', 'advance_adjusted', 'returns_credit', 'discount_received', 'status', 'payment_date'],
    order: [['invoice_date', 'ASC']]
  });

  const rows = [];
  for (const inv of invoices) {
    if (!inv.invoice_date) continue;
    const vendor = byId.get(inv.vendor_id);
    const days = allowedDays(vendor);
    const due = new Date(dateOnly(inv.invoice_date).getTime() + days * DAY);
    const balance = balanceOf(inv);
    const net = round2(Number(inv.total_amount || 0) - Number(inv.tds_amount || 0));
    let state;
    let daysLate = 0;
    if (balance > 0.009) {
      const left = Math.round((due - today) / DAY);
      if (left < 0) { state = 'OVERDUE'; daysLate = -left; } else if (left <= DUE_SOON_DAYS) state = 'DUE_SOON'; else state = 'WITHIN';
    } else {
      const paidOn = inv.payment_date ? dateOnly(inv.payment_date) : null;
      if (!paidOn || paidOn <= due) continue; // paid on time
      state = 'PAID_LATE';
      daysLate = Math.round((paidOn - due) / DAY);
    }
    rows.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: iso(inv.invoice_date),
      vendor_id: vendor.id,
      vendor_name: vendor.vendor_name,
      msme_category: vendor.msme_category,
      udyam_number: vendor.udyam_number,
      allowed_days: days,
      due_date: iso(due),
      amount: state === 'PAID_LATE' ? net : balance,
      payment_date: inv.payment_date ? iso(inv.payment_date) : null,
      state,
      days_late: daysLate,
      days_left: state === 'DUE_SOON' || state === 'WITHIN' ? Math.round((due - today) / DAY) : null
    });
  }

  const sum = (state) => {
    const list = rows.filter((r) => r.state === state);
    return { count: list.length, amount: round2(list.reduce((s, r) => s + r.amount, 0)) };
  };
  const order = { OVERDUE: 0, DUE_SOON: 1, WITHIN: 2, PAID_LATE: 3 };
  rows.sort((a, b) => order[a.state] - order[b.state] || a.due_date.localeCompare(b.due_date));

  return res.json({
    success: true,
    data: {
      rows,
      summary: { overdue: sum('OVERDUE'), due_soon: sum('DUE_SOON'), paid_late: sum('PAID_LATE'), msme_vendors: vendors.length },
      not_classified: notClassified
    }
  });
};
