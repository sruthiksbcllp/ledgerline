'use strict';

/**
 * Dual Depreciation Engine
 * Calculates depreciation according to Companies Act (SLM) and Income Tax Act (WDV)
 */
const COMPANIES_ACT_RULES = {
  BUILDINGS_RCC_FRAME: { usefulLife: 60, slmRate: 1.58, wdvRate: 5.13 },
  BUILDINGS_OTHER: { usefulLife: 30, slmRate: 3.17, wdvRate: 9.5 },
  FACTORY_BUILDINGS: { usefulLife: 30, slmRate: 3.17, wdvRate: 9.5 },
  FURNITURE_FITTINGS: { usefulLife: 10, slmRate: 9.5, wdvRate: 25.89 },
  COMPUTERS_SOFTWARE: { usefulLife: 3, slmRate: 31.67, wdvRate: 63.16 },
  PLANT_MACHINERY: { usefulLife: 15, slmRate: 6.33, wdvRate: 18.1 },
  OFFICE_EQUIPMENT: { usefulLife: 5, slmRate: 19, wdvRate: 45.07 },
  MOTOR_VEHICLES: { usefulLife: 8, slmRate: 11.88, wdvRate: 31.23 },
  AIR_WATER_CRAFT: { usefulLife: 20, slmRate: 4.75, wdvRate: 13.91 }
};

const IT_ACT_RULES = {
  RESIDENTIAL_BUILDINGS: { rate: 5, block: 'Residential Buildings' },
  NON_RESIDENTIAL_BUILDINGS: { rate: 10, block: 'Non-Residential Buildings' },
  FURNITURE_FITTINGS: { rate: 10, block: 'Furniture & Fittings' },
  PLANT_MACHINERY: { rate: 15, block: 'Plant & Machinery' },
  MOTOR_VEHICLES_PERSONAL: { rate: 15, block: 'Motor Vehicles (Personal)' },
  MOTOR_VEHICLES_COMMERCIAL: { rate: 30, block: 'Motor Vehicles (Commercial)' },
  COMPUTERS_SOFTWARE: { rate: 40, block: 'Computers & Software' },
  BOOKS_PROFESSION: { rate: 40, block: 'Books' },
  INTANGIBLE_ASSETS: { rate: 25, block: 'Intangible Assets' },
  SHIPS: { rate: 20, block: 'Ships' },
  AIRCRAFT: { rate: 40, block: 'Aircraft' }
};

class DepreciationEngine {
  round(value) {
    return Number(parseFloat(value || 0).toFixed(2));
  }

  normalizeCategoryKey(category) {
    // Prefer it_act_block stored on the subcategory (set by seed_schedule_ii.js Schedule II data)
    const itBlock = String(category?.it_act_block || '').toUpperCase();
    if (itBlock === 'COMPUTERS') return 'COMPUTERS_SOFTWARE';
    if (itBlock === 'FURNITURE') return 'FURNITURE_FITTINGS';
    if (itBlock === 'OFFICE EQUIPMENT') return 'OFFICE_EQUIPMENT';
    if (itBlock === 'AIRCRAFT') return 'AIRCRAFT';
    if (itBlock === 'SHIPS') return 'SHIPS';

    // Fallback: name-based matching covering all Schedule II subcategory names
    const s = `${category?.category_name || ''} ${category?.sub_category_name || ''} ${itBlock}`.toUpperCase();
    if (s.includes('COMPUTER') || s.includes('SOFTWARE') || s.includes('SERVER') || s.includes('END-USER') || s.includes('END USER')) return 'COMPUTERS_SOFTWARE';
    if (s.includes('FURNITURE')) return 'FURNITURE_FITTINGS';
    if (s.includes('GENERAL OFFICE')) return 'OFFICE_EQUIPMENT';
    if ((s.includes('CAR') || s.includes('VEHICLE')) && (s.includes('HIRE') || s.includes('COMMERCIAL'))) return 'MOTOR_VEHICLES_COMMERCIAL';
    if (s.includes('VEHICLE') || s.includes('MOTOR') || s.includes('SCOOTER') || s.includes('TRACTOR') || s.includes('ELECTRIC VEH')) return 'MOTOR_VEHICLES';
    if (s.includes('AIRCRAFT') || s.includes('HELICOPTER')) return 'AIRCRAFT';
    if (s.includes('SHIP') || s.includes('VESSEL') || s.includes('INLAND WATER')) return 'SHIPS';
    if (s.includes('INTANGIBLE')) return 'INTANGIBLE_ASSETS';
    if (s.includes('FACTORY') || s.includes('RCC') || s.includes('TEMPORARY STRUCT') || s.includes('FENCE') || s.includes('TUBE WELL') || s.includes('BUILDING')) return 'NON_RESIDENTIAL_BUILDINGS';
    if (s.includes('RAILWAY') || s.includes('LOCOMOTIVE') || s.includes('ROLLING STOCK') || s.includes('TELECOM') || s.includes('PHARMA') || s.includes('STEEL') || s.includes('OIL') || s.includes('POWER GEN') || s.includes('LAB') || s.includes('MEDICAL') || s.includes('SURGICAL') || s.includes('ELECTRICAL') || s.includes('GENERATOR') || s.includes('TRANSFORMER') || s.includes('PLANT') || s.includes('MACHINERY')) return 'PLANT_MACHINERY';
    return 'PLANT_MACHINERY'; // safe default — all unrecognised assets depreciate as Plant & Machinery
  }

  getFinancialYearRange(dateValue = new Date()) {
    const date = new Date(dateValue);
    const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    return {
      start: new Date(year, 3, 1),
      end: new Date(year + 1, 2, 31),
      fy: `${year}-${String(year + 1).slice(-2)}`
    };
  }

  /**
   * Calculate depreciation for both acts with full Schedule II / IT Act compliance.
   * @param {Object} asset    - Asset record (includes useful_life, depreciation_method, residual_value, etc.)
   * @param {Object} category - AssetCategory OR AssetSubCategory object carrying Schedule II fields
   *                            (companies_act_life, companies_act_method, it_act_rate, it_act_block, useful_life)
   * @returns {Object} Calculated values for companies_act and it_act books
   */
  calculate(asset, category) {
    const cost = parseFloat(asset.total_cost || asset.purchase_cost || 0);
    const putToUseDate = asset.put_to_use_date ? new Date(asset.put_to_use_date) : (asset.purchase_date ? new Date(asset.purchase_date) : null);
    const now = new Date();
    const { start: fyStart, end: fyEnd, fy } = this.getFinancialYearRange(now);
    const startDate = putToUseDate && putToUseDate > fyStart ? putToUseDate : fyStart;
    const daysUsed = putToUseDate ? Math.max(0, Math.floor((Math.min(now, fyEnd) - startDate) / (1000 * 60 * 60 * 24)) + 1) : 365;
    const proRataFactor = Math.min(1, Math.max(0, daysUsed / 365));

    // Use category as the subcategory object when it carries Schedule II fields directly,
    // otherwise fall back to the static COMPANIES_ACT_RULES lookup.
    const categoryKey = this.normalizeCategoryKey(category);
    const companyRule = COMPANIES_ACT_RULES[categoryKey] || COMPANIES_ACT_RULES.PLANT_MACHINERY;

    // Schedule II: useful life — prefer asset-level override, then subcategory, then static table
    const usefulLife = parseInt(
      asset.useful_life ||
      category?.companies_act_life ||
      category?.useful_life ||
      companyRule.usefulLife ||
      5,
      10
    );

    // Schedule II: residual value — must not exceed 5% of cost
    const maxResidual = cost * 0.05;
    const rawResidual = parseFloat(asset.residual_value ?? maxResidual);
    const residual = Math.min(rawResidual, maxResidual); // enforce 5% cap

    const openingCoWdv = parseFloat(asset.opening_wdv || cost);
    const shiftType = String(asset.shift_type || 'single').toLowerCase();
    const shiftMultiplier = shiftType === 'triple' ? 2 : shiftType === 'double' ? 1.5 : 1;

    let coSlmAnnual = usefulLife > 0 ? ((cost - residual) / usefulLife) * proRataFactor : 0;
    let coWdvAnnual = openingCoWdv * ((companyRule.wdvRate || 0) / 100) * proRataFactor;

    if (cost <= 5000) {
      // Assets costing ≤ ₹5,000 are fully depreciated in the year of purchase (Schedule II para 5)
      coSlmAnnual = cost;
      coWdvAnnual = cost;
    } else {
      coSlmAnnual *= shiftMultiplier;
      coWdvAnnual *= shiftMultiplier;
    }

    // Depreciation method — prefer asset-level, then Schedule II subcategory field, default SLM
    const selectedMethod = String(
      asset.depreciation_method ||
      category?.companies_act_method ||
      'SLM'
    ).toUpperCase();
    const companiesAnnual = selectedMethod === 'WDV' ? coWdvAnnual : coSlmAnnual;
    const coAcc = parseFloat(asset.accumulated_depreciation_opening || asset.companies_act_accumulated || 0) + companiesAnnual;
    const coNbv = Math.max(residual, cost - coAcc);

    // IT Act: use rate from subcategory Schedule II data; fallback to static table
    const itRule = IT_ACT_RULES[categoryKey] || IT_ACT_RULES.PLANT_MACHINERY;
    const itRate = parseFloat(category?.it_act_rate ?? itRule.rate ?? 15);
    const itOpeningWdv = parseFloat(asset.it_act_wdv || asset.opening_wdv || cost);
    // Half-year rule: assets put to use after 3 October get 50% depreciation
    const isHalfYear = !!putToUseDate && putToUseDate > new Date(fyStart.getFullYear(), 9, 3);
    let itDep = itOpeningWdv * (itRate / 100);
    if (isHalfYear) itDep *= 0.5;

    const itAcc = parseFloat(asset.it_act_accumulated || 0) + itDep;
    const itWdv = Math.max(0, itOpeningWdv - itDep);

    return {
      companies_act: {
        depreciation: this.round(companiesAnnual),
        accumulated: this.round(coAcc),
        nbv: this.round(coNbv),
        slm_annual: this.round(coSlmAnnual),
        wdv_annual: this.round(coWdvAnnual),
        residual_value: this.round(residual),
        useful_life_years: usefulLife,
        method: selectedMethod
      },
      it_act: {
        depreciation: this.round(itDep),
        accumulated: this.round(itAcc),
        wdv: this.round(itWdv),
        rate: this.round(itRate),
        half_year_rule_applied: isHalfYear,
        block: itRule.block
      },
      meta: {
        fy,
        days_used: daysUsed,
        shift_multiplier: shiftMultiplier
      }
    };
  }

  // ─── Advanced Depreciation Methods (Gap 7) ───

  calculateUoP(asset, unitsThisPeriod) {
    const cost = Number(asset.cost_of_purchase || 0);
    const residual = Number(asset.residual_value || 0);
    const totalUnits = Number(asset.total_estimated_units || 1);
    const depreciableBase = cost - residual;
    const depPerUnit = depreciableBase / totalUnits;
    const depAmount = depPerUnit * Number(unitsThisPeriod || 0);
    return { method: 'UOP', annual_depreciation: depAmount, dep_per_unit: depPerUnit, units_this_period: unitsThisPeriod };
  }

  calculateSYD(asset) {
    const cost = Number(asset.cost_of_purchase || 0);
    const residual = Number(asset.residual_value || 0);
    const life = Number(asset.original_useful_life_years || 5);
    const startDate = new Date(asset.date_of_put_in_place || Date.now());
    const yearsElapsed = Math.floor((Date.now() - startDate.getTime()) / (365.25 * 86400000));
    const remainingLife = Math.max(life - yearsElapsed, 0);
    const sumOfYears = (life * (life + 1)) / 2;
    const depreciableBase = cost - residual;
    const annualDep = sumOfYears > 0 ? (remainingLife / sumOfYears) * depreciableBase : 0;
    return { method: 'SYD', annual_depreciation: annualDep, remaining_life: remainingLife, sum_of_years: sumOfYears };
  }

  calculateDecliningBalance(asset, rate) {
    const cost = Number(asset.cost_of_purchase || 0);
    const residual = Number(asset.residual_value || 0);
    const r = Number(rate || 15) / 100;
    const startDate = new Date(asset.date_of_put_in_place || Date.now());
    const yearsElapsed = Math.floor((Date.now() - startDate.getTime()) / (365.25 * 86400000));
    const openingWdv = cost * Math.pow(1 - r, yearsElapsed);
    const annualDep = Math.max(openingWdv * r, 0);
    const closingWdv = Math.max(openingWdv - annualDep, residual);
    return { method: 'DECLINING_BALANCE', annual_depreciation: annualDep, opening_wdv: openingWdv, closing_wdv: closingWdv, rate: r * 100 };
  }

  calculateGroupDepreciation(assets) {
    if (!assets || !assets.length) return { method: 'GROUP', annual_depreciation: 0, asset_count: 0 };
    let totalCost = 0, weightedDep = 0;
    for (const a of assets) {
      const cost = Number(a.cost_of_purchase || a.purchase_cost || 0);
      const life = Number(a.original_useful_life_years || a.useful_life || 5);
      const residual = Number(a.residual_value || 0);
      totalCost += cost;
      weightedDep += (cost - residual) / life;
    }
    const compositeRate = totalCost > 0 ? (weightedDep / totalCost) * 100 : 0;
    return { method: 'GROUP', annual_depreciation: weightedDep, composite_rate: compositeRate, asset_count: assets.length, total_cost: totalCost };
  }

  calculateByMethod(asset, category, method, params = {}) {
    switch ((method || '').toUpperCase()) {
      case 'SLM': case 'SLM_COMPANIES_ACT': return this.calculate(asset, category);
      case 'WDV': case 'WDV_IT_ACT': return this.calculate(asset, category);
      case 'UOP': case 'UNITS_OF_PRODUCTION': return this.calculateUoP(asset, params.units_this_period || 0);
      case 'SYD': case 'SUM_OF_YEARS': return this.calculateSYD(asset);
      case 'DECLINING_BALANCE': case 'DB': return this.calculateDecliningBalance(asset, params.rate || asset.wdv_rate || 15);
      case 'GROUP': case 'COMPOSITE': return this.calculateGroupDepreciation(params.assets || [asset]);
      default: return this.calculate(asset, category);
    }
  }
}

module.exports = new DepreciationEngine();
