const { Asset, AssetAccounting, DepreciationLedger, ActivityLog } = require('../models');
// depreciationEngine required inline below (avoids circular dep issues with models)
const logger = require('../utils/appLogger');
const { isComplete: depConfigComplete, missingFields: depConfigMissing } = require('../utils/depreciationConfig');

// Correct SLM monthly depreciation (Companies Act, Schedule II).
// monthly = (cost - residual)/usefulLife/12; the ONLY pro-rated month is the put-to-use
// month (by days-in-that-month). Capped so accumulated never exceeds the depreciable base.
// Fixes the prior double-pro-rata (engine annual x days/365, then /12).
function slmMonthlyDepreciation({ cost, residualValue, usefulLifeYears, inServiceDate, monthStart, monthEnd, priorAccumulated = 0 }) {
  cost = Number(cost || 0);
  const residualCap = cost * 0.05;
  // Honor an EXPLICIT 0 residual (0 is falsy in JS — a plain `|| residualCap` wrongly forced 5%).
  // null/undefined = not set -> default to the Schedule II 5% cap (unchanged for existing tenants).
  const residual = (residualValue === null || residualValue === undefined)
    ? residualCap
    : Math.min(Number(residualValue) || 0, residualCap); // Schedule II 5% cap
  const life = Number(usefulLifeYears || 0);
  const depreciableBase = Math.max(0, cost - residual);
  const fullMonthly = life > 0 ? depreciableBase / (life * 12) : 0;
  const DAY = 86400000;
  const ms = new Date(monthStart), me = new Date(monthEnd), svc = new Date(inServiceDate);
  const daysInMonth = Math.floor((me - ms) / DAY) + 1;
  const firstMonth = svc > ms && svc <= me; // put-to-use falls inside this posting month
  const monthly = firstMonth ? fullMonthly * ((Math.floor((me - svc) / DAY) + 1) / daysInMonth) : fullMonthly;
  const remaining = Math.max(0, depreciableBase - Number(priorAccumulated || 0));
  return Math.round(Math.min(monthly, remaining) * 100) / 100;
}

// Companies Act WDV (reducing balance) monthly depreciation.
// Derives the Schedule II ANNUAL WDV rate from useful life + residual so that after `life`
// years the WDV lands exactly on the residual (residual = cost*(1-R)^life => R = 1-(residual/cost)^(1/life)),
// then converts to the EQUIVALENT monthly reducing-balance rate (1-(1-R)^(1/12)) so 12 monthly
// compounded charges equal the annual charge. Depreciates on the CURRENT running WDV
// (cost - prior accumulated); first month day-prorated; never dips below residual.
function wdvMonthlyDepreciation({ cost, residualValue, usefulLifeYears, inServiceDate, monthStart, monthEnd, priorAccumulated = 0 }) {
  cost = Number(cost || 0);
  const residualCap = cost * 0.05;
  // Honor an EXPLICIT 0 residual; null/undefined -> default 5% cap (unchanged for existing tenants).
  const residual = (residualValue === null || residualValue === undefined)
    ? residualCap
    : Math.min(Number(residualValue) || 0, residualCap);
  const life = Number(usefulLifeYears || 0);
  if (cost <= 0 || life <= 0) return 0;
  const openingWdv = Math.max(0, cost - Number(priorAccumulated || 0));
  if (openingWdv <= residual) return 0;
  const ratioBase = Math.max(residual, 1) / cost; // guard residual 0 -> tiny
  const annualRate = 1 - Math.pow(ratioBase, 1 / life);            // Schedule II annual WDV rate
  const monthlyRate = 1 - Math.pow(1 - annualRate, 1 / 12);        // equivalent monthly rate
  const DAY = 86400000;
  const ms = new Date(monthStart), me = new Date(monthEnd), svc = new Date(inServiceDate);
  const daysInMonth = Math.floor((me - ms) / DAY) + 1;
  const firstMonth = svc > ms && svc <= me;
  const factor = firstMonth ? ((Math.floor((me - svc) / DAY) + 1) / daysInMonth) : 1;
  let dep = openingWdv * monthlyRate * factor;
  dep = Math.min(dep, openingWdv - residual); // never depreciate below residual
  return Math.round(Math.max(0, dep) * 100) / 100;
}

// CR-DEP-P2a: monthly IT-Act rows RETIRED. IT depreciation is now annual on blocks of assets
// (Section 32) via itActBlockPosting.service — run separately. Only the Companies Act book posts
// monthly here. The old WDV_IT_ACT per-month approximation is no longer written.
const BOOKS = [
  { book_type: 'SLM_COMPANIES_ACT', method: 'SLM' }
];

const monthBounds = (year, month) => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start, end };
};

const runMonthlyDepreciationPosting = async ({ fiscal_year, period_month, clientId, userId = null, source = 'manual', onProgress = null }) => {
  const month = Number(period_month);
  const fyStartYear = Number(String(fiscal_year).split('-')[0]);
  const postingYear = month >= 4 ? fyStartYear : fyStartYear + 1;
  const { start: monthStart, end: monthEnd } = monthBounds(postingYear, month);

  const { AssetSubCategory, AssetCategory } = require('../models');

  let postedCount = 0;
  let skippedCount = 0;
  let processedAssets = 0;
  const posted = [];

  // SCALE SAFETY: process assets in bounded batches so a large tenant (e.g. 2.5-lakh assets)
  // cannot exhaust the Node heap by loading every asset (with associations) at once — doing so
  // OOM-killed the API. Offset pagination is safe here: the per-asset updates below never change
  // the WHERE (is_active/client_id) or ORDER (id) columns, so the set and order stay stable.
  const DEP_BATCH_SIZE = Number(process.env.DEP_POST_BATCH_SIZE || 500);
  for (let offset = 0; ; offset += DEP_BATCH_SIZE) {
    const assets = await Asset.findAll({
      where: { is_active: true, client_id: clientId },
      include: [
        { model: AssetAccounting },
        { model: AssetSubCategory, required: false },
        { model: AssetCategory, as: 'category', required: false }
      ],
      order: [['id', 'ASC']],
      limit: DEP_BATCH_SIZE,
      offset
    });
    if (!assets.length) break;

  for (const asset of assets) {
    processedAssets += 1;
    // Skip parent assets — their components depreciate individually
    if (asset.is_component_parent) { skippedCount += 1; continue; }

    let accounting = asset.AssetAccounting;
    if (!accounting) {
      const putToUseDate = asset.put_to_use_date || asset.purchase_date;
      if (!putToUseDate) { skippedCount += 1; continue; }
      const usefulLife = Number(asset.useful_life || 5);
      const retirementDate = new Date(putToUseDate);
      retirementDate.setFullYear(retirementDate.getFullYear() + usefulLife);
      accounting = {
        date_of_put_in_place: putToUseDate,
        date_of_retirement: retirementDate,
        method_of_depreciation: asset.depreciation_method || 'SLM',
        original_useful_life_years: usefulLife,
        residual_value: asset.residual_value || 0,
        cost_of_purchase: asset.total_cost || asset.purchase_cost || 0,
        accumulated_dep_opening_balance: asset.accumulated_depreciation_opening || 0,
        wdv_rate: 0,
        it_act_rate: 0,
        id: null
      };
    }

    const inServiceStart = accounting.date_of_put_in_place || asset.purchase_date;
    const inServiceEnd = accounting.date_of_sale || accounting.date_of_retirement || null;
    if (!inServiceStart || new Date(inServiceStart) > monthEnd) {
      skippedCount += 1;
      continue;
    }

    // C2 (CFO-approved): single depreciable base = TOTAL CAPITALISED COST.
    const costForNbv = parseFloat(asset.total_cost || accounting.cost_of_purchase || asset.purchase_cost || 0);

    // C1 (CFO-approved): honour the asset's Companies Act method (SLM vs WDV).
    const companiesMethod = String(
      accounting.method_of_depreciation ||
      asset.depreciation_method ||
      asset.AssetSubCategory?.companies_act_method ||
      asset.category?.companies_act_method ||
      'SLM'
    ).toUpperCase();

    for (const book of BOOKS) {
      const alreadyPosted = await DepreciationLedger.findOne({
        where: {
          asset_id: asset.id,
          book_type: book.book_type,
          fiscal_year,
          period_month: month
        }
      });
      if (alreadyPosted) continue;

      const previous = await DepreciationLedger.findOne({
        where: { asset_id: asset.id, book_type: book.book_type },
        order: [['fiscal_year', 'DESC'], ['period_month', 'DESC']]
      });

      const depreciationEngine = require('../utils/depreciationEngine');
      const scheduleIISource = asset.AssetSubCategory || asset.category || {};
      // CR-DEP-P3 (D2 Phase 1 — observability only): if the asset's (sub-)category is not
      // configured for depreciation, the engine silently defaults it to Plant & Machinery.
      // Log it (do NOT change behaviour yet). Phase 2 flips this to a hard skip-with-reason
      // once seeding is verified and the depreciation-gaps report reads zero.
      if (!depConfigComplete(scheduleIISource)) {
        logger.warn('depreciation.unconfigured_category_default', {
          asset_id: asset.id,
          asset_code: asset.asset_code,
          client_id: asset.client_id,
          sub_category_id: asset.sub_category_id,
          category_id: asset.category_id,
          missing: depConfigMissing(scheduleIISource),
          note: 'engine used Plant & Machinery default — configure category (CR-DEP-P3)'
        });
      }
      const depResult = depreciationEngine.calculate(asset, scheduleIISource);

      let depreciationAmount = 0;
      let openingValue = 0;
      let closingValue = 0;

      if (book.book_type === 'SLM_COMPANIES_ACT') {
        // Companies Act book — method per asset (SLM or WDV), single total-cost base.
        const priorAcc = Number(previous?.accumulated_depreciation || 0);
        const life = accounting.original_useful_life_years || asset.useful_life || 5;
        const inSvc = accounting.date_of_put_in_place || asset.purchase_date;
        if (companiesMethod === 'WDV') {
          depreciationAmount = wdvMonthlyDepreciation({
            cost: costForNbv,
            residualValue: accounting.residual_value,
            usefulLifeYears: life,
            inServiceDate: inSvc,
            monthStart, monthEnd,
            priorAccumulated: priorAcc
          });
        } else {
          depreciationAmount = slmMonthlyDepreciation({
            cost: costForNbv,
            residualValue: accounting.residual_value,
            usefulLifeYears: life,
            inServiceDate: inSvc,
            monthStart, monthEnd,
            priorAccumulated: priorAcc
          });
        }
        openingValue = Math.max(0, costForNbv - priorAcc);
        closingValue = Math.max(0, openingValue - depreciationAmount);
      } else {
        // IT Act book — LEFT AS-IS (approximate). P2 CR replaces this with a true annual
        // block-of-assets engine (Section 32). Do not rely on these rows for tax filing.
        depreciationAmount = (depResult.it_act.depreciation || 0) / 12;
        openingValue = (depResult.it_act.wdv || 0) + (depResult.it_act.depreciation || 0);
        closingValue = depResult.it_act.wdv || 0;
      }

      const accumulated = Math.round((Number(previous?.accumulated_depreciation || 0) + depreciationAmount) * 100) / 100;
      const inServiceDate = new Date(accounting.date_of_put_in_place || asset.purchase_date);
      const isProrata = inServiceDate > monthStart;
      const prorataDays = isProrata
        ? Math.floor((monthEnd - inServiceDate) / (1000 * 60 * 60 * 24)) + 1
        : Math.floor((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1;

      await DepreciationLedger.create({
        asset_id: asset.id,
        accounting_id: accounting.id,
        company_id: asset.company_id || null,
        book_type: book.book_type,
        fiscal_year,
        period_month: month,
        opening_value: openingValue,
        depreciation_amount: depreciationAmount,
        closing_value: closingValue,
        accumulated_depreciation: accumulated,
        is_prorata: isProrata,
        prorata_days: prorataDays,
        calculated_by: userId
      });

      // Update stored NBV/WDV on the asset so dashboard reads are always current
      const updateFields = {};
      if (book.book_type === 'SLM_COMPANIES_ACT') {
        updateFields.companies_act_depreciation = depreciationAmount;
        updateFields.companies_act_accumulated = accumulated;
        updateFields.companies_act_nbv = Math.max(0, costForNbv - accumulated);
        updateFields.co_act_accumulated_dep = accumulated;
        updateFields.co_act_wdv_remaining = Math.max(0, costForNbv - accumulated);
      } else {
        updateFields.it_act_depreciation = depreciationAmount;
        updateFields.it_act_accumulated = accumulated;
        updateFields.it_act_wdv = Math.max(0, costForNbv - accumulated);
        updateFields.it_act_accumulated_dep = accumulated;
        updateFields.it_act_wdv_remaining = Math.max(0, costForNbv - accumulated);
      }
      await Asset.update(updateFields, { where: { id: asset.id } });

      posted.push({
        asset_id: asset.id,
        asset_code: asset.asset_code,
        book_type: book.book_type,
        depreciation_amount: depreciationAmount
      });
      postedCount += 1;
    }
  }
    if (typeof onProgress === 'function') {
      try { await onProgress({ processed: processedAssets, posted: postedCount, skipped: skippedCount }); } catch { /* progress is best-effort */ }
    }
  } // end batch loop

  if (userId) {
    await ActivityLog.create({
      user_id: userId,
      action: 'DEPRECIATION_POST',
      module: 'FINANCE',
      description: `Monthly depreciation posted for ${fiscal_year} M${month}`,
      new_values: { fiscal_year, period_month: month, postedCount, skippedCount, source }
    });
  }

  // GL Integration — post depreciation JV (no-op if toggle is OFF)
  if (posted.length > 0) {
    try {
      const { postDepreciation } = require('./glPostingService');
      await postDepreciation({ clientId, fiscal_year, period_month: month, posted });
    } catch (e) { /* GL posting is non-blocking */ }
  }

  return { fiscal_year, period_month: month, postedCount, skippedCount, posted };
};

// CR-DEP-01: count of assets the monthly run will iterate (same WHERE as the batch load),
// used to decide sync-vs-async and to set the job's total_assets.
const countPostableAssets = async (clientId) => Asset.count({ where: { is_active: true, client_id: clientId } });

module.exports = {
  slmMonthlyDepreciation, wdvMonthlyDepreciation, runMonthlyDepreciationPosting, countPostableAssets };
