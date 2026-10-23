/**
 * CR-DEP-P6 — Companies Act (book) depreciation DISPLAY values for asset lists/FAR.
 *
 * Financial Reporting Presentation defect fix: the Companies Act columns
 * (Accumulated Dep (CA), Depreciation Value, WDV/NBV (CA), Annual Dep (CA))
 * must be derived ONLY from Companies Act sources. They must NEVER fall back to
 * Income Tax Act fields (e.g. it_act_accumulated_dep / it_act_depreciation), which
 * for IT Equipment use the 40% "Computers" block rate and were being shown in the
 * Companies Act columns whenever the (correct) Companies Act value was 0.
 *
 * This is presentation-only. It does NOT change stored data, the posting engine,
 * or the GL. Accounting rule honoured across the asset lifecycle:
 *   - No Companies Act depreciation posted yet  -> accumulated = opening (0 for a
 *     new asset), NBV = cost.
 *   - Companies Act depreciation posted         -> accumulated = posted CA ledger,
 *     NBV = cost - posted CA accumulated.
 *   - Never the Income Tax Act value.
 */

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const firstNonZeroNumber = (...values) => {
  for (const value of values) {
    const n = toFiniteNumber(value);
    if (n !== 0) return n;
  }
  return 0;
};

/**
 * @param {object} plain               asset row (plain object)
 * @param {number} ledgerAccumulated   SUM/MAX accumulated from the SLM_COMPANIES_ACT ledger for this asset
 * @returns {{originalCost:number, accumulated:number, nbv:number, annualDep:number}}
 */
function computeCompaniesActDisplay(plain = {}, ledgerAccumulated = 0) {
  const originalCost = toFiniteNumber(plain.total_cost || plain.purchase_cost);

  // Companies Act accumulated — CA sources ONLY (no it_act_*).
  const persistedAccumulated = firstNonZeroNumber(
    plain.companies_act_accumulated,
    plain.co_act_accumulated_dep,
    plain.AssetAccounting && plain.AssetAccounting.accumulated_dep_opening_balance,
    plain.accumulated_depreciation_opening
  );

  const existingNbv = toFiniteNumber(plain.companies_act_nbv || plain.co_act_wdv_remaining);
  const nbvDerivedAccumulated = (originalCost > 0 && existingNbv > 0 && existingNbv < originalCost)
    ? originalCost - existingNbv
    : 0;

  // Precedence: persisted CA snapshot -> posted CA ledger -> derive from CA NBV.
  const accumulated = firstNonZeroNumber(persistedAccumulated, toFiniteNumber(ledgerAccumulated), nbvDerivedAccumulated);
  const nbv = Math.max(0, originalCost - accumulated);

  // Annual (period) Companies Act charge — CA sources ONLY (no it_act_depreciation).
  const annualDep = firstNonZeroNumber(
    plain.companies_act_depreciation,
    plain.co_act_dep_slm_annual,
    plain.co_act_dep_wdv_annual
  );

  return { originalCost, accumulated, nbv, annualDep };
}

module.exports = { computeCompaniesActDisplay, toFiniteNumber, firstNonZeroNumber };
