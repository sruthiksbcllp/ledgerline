'use strict';
/**
 * Budgetary Depreciation Engine
 * Computes 12-month projected depreciation for budgetary assets.
 * Does NOT touch live SLM/WDV ledger rows.
 */
const { Asset, AssetCategory, AssetSubCategory, DepreciationLedger } = require('../models');
const { Op } = require('sequelize');

/**
 * Compute monthly SLM depreciation
 */
const slmMonthly = (cost, residual, usefulLifeYears) => {
  if (!usefulLifeYears || usefulLifeYears <= 0) return 0;
  return Math.max(0, (Number(cost) - Number(residual)) / (usefulLifeYears * 12));
};

/**
 * Compute monthly WDV depreciation
 * wdvRate is annual % e.g. 18.10
 */
const wdvMonthly = (openingWdv, wdvRateAnnual) => {
  if (!wdvRateAnnual || wdvRateAnnual <= 0) return 0;
  const monthlyRate = wdvRateAnnual / 100 / 12;
  return Math.max(0, Number(openingWdv) * monthlyRate);
};

/**
 * Generate 12-month depreciation projection for a single asset.
 * fromDate: JS Date — projection starts from this month
 */
const project12Months = (asset, fromDate) => {
  const cost      = Number(asset.budgetary_cost || asset.purchase_cost || asset.total_cost || 0);
  const residual  = Number(asset.budgetary_residual_value ?? asset.residual_value ?? 0);
  const life      = Number(asset.budgetary_useful_life || asset.useful_life || 5);
  const method    = (asset.budgetary_method || asset.depreciation_method || 'SLM').toUpperCase();
  const wdvRate   = Number(asset.wdv_rate || 0);

  const months = [];
  let openingWdv = cost;

  for (let i = 0; i < 12; i++) {
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth() + i, 1);
    const label = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });

    let depAmt;
    if (method === 'WDV') {
      depAmt = wdvMonthly(openingWdv, wdvRate || 18.10);
    } else {
      depAmt = slmMonthly(cost, residual, life);
    }

    depAmt = Math.min(depAmt, Math.max(0, openingWdv - residual));
    const closingWdv = Math.max(residual, openingWdv - depAmt);

    months.push({
      month_label: label,
      month_index: i + 1,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      opening_wdv: Math.round(openingWdv * 100) / 100,
      depreciation: Math.round(depAmt * 100) / 100,
      closing_wdv: Math.round(closingWdv * 100) / 100
    });

    openingWdv = closingWdv;
  }
  return months;
};

/**
 * Run budgetary depreciation projection for all budgetary assets of a client.
 * Returns: { asset_wise: [...], summary: [...12 months...] }
 */
const runBudgetaryProjection = async ({ clientId, fromDate }) => {
  const start = fromDate ? new Date(fromDate) : new Date();
  start.setDate(1); // normalise to month start

  const where = { is_budgetary: true, is_active: true };
  if (clientId !== null && clientId !== undefined) where.client_id = clientId;
  const assets = await Asset.findAll({
    where,
    include: [
      { model: AssetCategory, as: 'category', required: false }
    ]
  });

  const assetWise = assets.map(a => ({
    asset_id: a.id,
    asset_code: a.asset_code,
    asset_name: a.asset_name,
    company_id: a.company_id || null,
    method: (a.budgetary_method || a.depreciation_method || 'SLM').toUpperCase(),
    cost: Number(a.budgetary_cost || a.purchase_cost || 0),
    residual: Number(a.budgetary_residual_value ?? a.residual_value ?? 0),
    useful_life: Number(a.budgetary_useful_life || a.useful_life || 5),
    category: a.category?.category_name || '-',
    months: project12Months(a, start)
  }));

  // Build 12-month summary (sum across all assets)
  const summary = Array.from({ length: 12 }, (_, i) => {
    const totalDep     = assetWise.reduce((s, a) => s + (a.months[i]?.depreciation || 0), 0);
    const totalOpening = assetWise.reduce((s, a) => s + (a.months[i]?.opening_wdv || 0), 0);
    const totalClosing = assetWise.reduce((s, a) => s + (a.months[i]?.closing_wdv || 0), 0);
    return {
      month_label: assetWise[0]?.months[i]?.month_label || ('M' + (i + 1)),
      month_index: i + 1,
      total_opening_wdv: Math.round(totalOpening * 100) / 100,
      total_depreciation: Math.round(totalDep * 100) / 100,
      total_closing_wdv: Math.round(totalClosing * 100) / 100
    };
  });

  return { asset_wise: assetWise, summary, total_assets: assets.length };
};

/**
 * Persist budgetary projection to DepreciationLedger (book_type = BUDGETARY)
 * Upserts so re-running is safe.
 */
const persistBudgetaryLedger = async ({ clientId, fromDate, userId }) => {
  const { asset_wise } = await runBudgetaryProjection({ clientId, fromDate });
  let written = 0;

  for (const asset of asset_wise) {
    for (const m of asset.months) {
      const fyYear = m.month >= 4 ? m.year : m.year - 1;
      const fy = fyYear + '-' + String(fyYear + 1).slice(2);

      const existing = await DepreciationLedger.findOne({
        where: {
          asset_id: asset.asset_id,
          book_type: 'BUDGETARY',
          fiscal_year: fy,
          period_month: m.month
        }
      });

      const payload = {
        asset_id: asset.asset_id,
        company_id: asset.company_id || null,
        book_type: 'BUDGETARY',
        fiscal_year: fy,
        period_month: m.month,
        opening_value: m.opening_wdv,
        depreciation_amount: m.depreciation,
        closing_value: m.closing_wdv,
        calculated_by: userId || null
      };

      if (existing) {
        await existing.update(payload);
      } else {
        await DepreciationLedger.create(payload);
      }
      written++;
    }
  }
  return { written };
};

module.exports = { runBudgetaryProjection, persistBudgetaryLedger, project12Months };
