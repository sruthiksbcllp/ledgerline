'use strict';
const { Asset, AssetAccounting, sequelize } = require('../models');

/**
 * Gap 4: Asset Revaluation Service — Ind-AS 16
 */

async function revalueAsset({ assetId, fairValue, revaluationDate, valuerName, valuerReportRef, remarks, userId, clientId, tenantWhere = {} }) {
  const t = await sequelize.transaction();
  try {
    const asset = await Asset.findOne({ where: { id: assetId, ...tenantWhere }, include: [{ model: AssetAccounting }], transaction: t });
    if (!asset) throw new Error('Asset not found');

    const accounting = asset.AssetAccounting;
    const cost = Number(accounting?.cost_of_purchase || asset.purchase_cost || 0);
    // Calculate NBV (carrying amount)
    const { DepreciationLedger } = require('../models');
    const lastLedger = await DepreciationLedger.findOne({
      where: { asset_id: assetId },
      order: [['fiscal_year', 'DESC'], ['period_month', 'DESC']],
      transaction: t
    });
    const accDep = Number(lastLedger?.accumulated_depreciation || 0);
    const carryingAmount = cost - accDep;
    const surplusDeficit = Number(fairValue) - carryingAmount;

    // Create revaluation record
    const { AssetRevaluation } = require('../models');
    const reval = await AssetRevaluation.create({
      asset_id: assetId,
      client_id: clientId,
      revaluation_date: revaluationDate || new Date(),
      previous_carrying_amount: carryingAmount,
      fair_value: fairValue,
      surplus_deficit: surplusDeficit,
      revaluation_reserve: surplusDeficit > 0 ? surplusDeficit : 0,
      valuer_name: valuerName,
      valuer_report_ref: valuerReportRef,
      remarks,
      created_by: userId
    }, { transaction: t });

    // Update asset
    await asset.update({
      valuation_model: 'REVALUATION',
      last_revaluation_date: revaluationDate || new Date(),
      revalued_amount: fairValue,
      revaluation_reserve: Number(asset.revaluation_reserve || 0) + (surplusDeficit > 0 ? surplusDeficit : 0)
    }, { transaction: t });

    // Update AssetAccounting depreciable base
    if (accounting) {
      await accounting.update({
        cost_of_purchase: Number(fairValue) // New depreciable base = fair value
      }, { transaction: t });
    }

    await t.commit();
    return reval;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function getRevaluationHistory(assetId) {
  const { AssetRevaluation } = require('../models');
  return AssetRevaluation.findAll({
    where: { asset_id: assetId },
    order: [['revaluation_date', 'DESC']]
  });
}

module.exports = { revalueAsset, getRevaluationHistory };
