'use strict';
const { Asset, AssetAccounting, AssetCategory, Department, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Gap 9: Asset Forecasting Engine
 */

async function generateReplacementForecast(clientId, { horizonYears = 5, inflationRate = 5 } = {}) {
  const where = { is_active: true };
  if (clientId) where.client_id = clientId;

  const assets = await Asset.findAll({
    where,
    include: [
      { model: AssetAccounting },
      { model: AssetCategory, as: 'category', attributes: ['id', 'category_name'] }
    ]
  });

  const currentYear = new Date().getFullYear();
  const yearlyProjections = {};

  for (let y = 0; y < horizonYears; y++) {
    yearlyProjections[currentYear + y] = { year: currentYear + y, replacements: [], totalCost: 0, assetCount: 0 };
  }

  for (const asset of assets) {
    const accounting = asset.AssetAccounting;
    const usefulLife = Number(accounting?.original_useful_life_years || asset.useful_life || 10);
    const putDate = accounting?.date_of_put_in_place || asset.put_to_use_date || asset.purchase_date;
    if (!putDate) continue;

    const startYear = new Date(putDate).getFullYear();
    const replacementYear = startYear + usefulLife;

    if (replacementYear >= currentYear && replacementYear < currentYear + horizonYears) {
      const yearsFromNow = replacementYear - currentYear;
      const originalCost = Number(accounting?.cost_of_purchase || asset.purchase_cost || 0);
      const escalatedCost = originalCost * Math.pow(1 + inflationRate / 100, yearsFromNow);

      yearlyProjections[replacementYear].replacements.push({
        asset_id: asset.id,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        category: asset.category?.category_name,
        original_cost: originalCost,
        replacement_cost: Math.round(escalatedCost),
        age_at_replacement: usefulLife,
        put_to_use_date: putDate
      });
      yearlyProjections[replacementYear].totalCost += Math.round(escalatedCost);
      yearlyProjections[replacementYear].assetCount++;
    }
  }

  return {
    horizon_years: horizonYears,
    inflation_rate: inflationRate,
    projections: Object.values(yearlyProjections),
    summary: {
      total_replacements: Object.values(yearlyProjections).reduce((s, y) => s + y.assetCount, 0),
      total_projected_cost: Object.values(yearlyProjections).reduce((s, y) => s + y.totalCost, 0)
    }
  };
}

async function generateWhatIfScenario(clientId, { usefulLifeOverride, inflationRate = 5, horizonYears = 5, categoryId } = {}) {
  const where = { is_active: true };
  if (clientId) where.client_id = clientId;
  if (categoryId) where.category_id = categoryId;

  const assets = await Asset.findAll({
    where,
    include: [{ model: AssetAccounting }, { model: AssetCategory, as: 'category', attributes: ['id', 'category_name'] }]
  });

  const currentYear = new Date().getFullYear();
  const results = [];

  for (const asset of assets) {
    const accounting = asset.AssetAccounting;
    const originalLife = Number(accounting?.original_useful_life_years || asset.useful_life || 10);
    const effectiveLife = usefulLifeOverride || originalLife;
    const putDate = accounting?.date_of_put_in_place || asset.put_to_use_date || asset.purchase_date;
    if (!putDate) continue;

    const startYear = new Date(putDate).getFullYear();
    const replacementYear = startYear + effectiveLife;

    if (replacementYear >= currentYear && replacementYear < currentYear + horizonYears) {
      const yearsFromNow = replacementYear - currentYear;
      const originalCost = Number(accounting?.cost_of_purchase || asset.purchase_cost || 0);
      results.push({
        asset_id: asset.id,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        category: asset.category?.category_name,
        original_useful_life: originalLife,
        scenario_useful_life: effectiveLife,
        replacement_year: replacementYear,
        original_cost: originalCost,
        projected_replacement_cost: Math.round(originalCost * Math.pow(1 + inflationRate / 100, yearsFromNow))
      });
    }
  }

  return {
    scenario: { usefulLifeOverride, inflationRate, horizonYears, categoryId },
    assets: results,
    total_projected_cost: results.reduce((s, r) => s + r.projected_replacement_cost, 0)
  };
}

module.exports = { generateReplacementForecast, generateWhatIfScenario };
