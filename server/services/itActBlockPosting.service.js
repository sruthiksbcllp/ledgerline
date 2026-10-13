'use strict';
/**
 * CR-DEP-P2a — runs the annual IT-Act block-of-assets depreciation for a client + fiscal year.
 * Idempotent per (client, FY): re-running recomputes in place (existing rows for that FY replaced).
 * Disposals (sale proceeds) are OUT OF SCOPE (P2b) — sale_proceeds stays 0 here.
 */
const { Op } = require('sequelize');
const {
  Asset, AssetCategory, AssetSubCategory, ItActBlockLedger, ItActBlockAssetAlloc, AssetDisposal, sequelize,
} = require('../models');
const { computeBlock, allocateToAssets, additionHalfYear } = require('../utils/itActBlockEngine');
const logger = require('../utils/appLogger');

function fyString(startYear) { return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`; }
function fyStartYear(fiscalYear) { return Number(String(fiscalYear).slice(0, 4)); }

function resolveBlock(asset) {
  const sub = asset.AssetSubCategory || {};
  const cat = asset.category || {};
  const block = sub.it_act_block || cat.it_act_block || asset.it_act_block || null;
  const rate = Number(sub.it_act_rate ?? cat.it_act_rate ?? asset.it_act_rate ?? 0);
  return { block, rate };
}
const costOf = (a) => Number(a.total_cost || a.purchase_cost || 0);

async function runItActBlock(clientId, fiscalYearInput, opts = {}) {
  const startYear = fyStartYear(fiscalYearInput);
  const fy = fyString(startYear);
  const prevFy = fyString(startYear - 1);
  const { start } = { start: new Date(startYear, 3, 1) };

  const assets = await Asset.findAll({
    where: {
      client_id: clientId,
      is_active: true,
      is_disposed: { [Op.not]: true },
      is_budgetary: { [Op.not]: true },
    },
    include: [
      { model: AssetSubCategory, required: false },
      { model: AssetCategory, as: 'category', required: false },
    ],
  });

  // group active assets by block+rate
  const blocks = {};
  for (const a of assets) {
    const { block, rate } = resolveBlock(a);
    if (!block) continue; // P3 fail-fast prevents unconfigured assets; skip defensively
    const key = `${block}::${rate}`;
    (blocks[key] = blocks[key] || { block, rate, assets: [], saleProceeds: 0, disposedCount: 0 }).assets.push(a);
  }

  // P2b: COMPLETED disposals in the FY reduce their block's WDV (moneys received). A disposed
  // asset still exists (is_disposed) so its block resolves. A block with NO active assets left
  // after the FY's disposals has ceased -> Section 50 STCG/STCL.
  const fyStartD = new Date(startYear, 3, 1), fyEndD = new Date(startYear + 1, 2, 31);
  const disposals = await AssetDisposal.findAll({
    where: { client_id: clientId, status: 'COMPLETED', disposal_date: { [Op.between]: [fyStartD, fyEndD] } },
    include: [{ model: Asset, include: [
      { model: AssetSubCategory, required: false },
      { model: AssetCategory, as: 'category', required: false },
    ] }],
  });
  for (const d of disposals) {
    const a = d.Asset; if (!a) continue;
    const { block, rate } = resolveBlock(a);
    if (!block) continue;
    const key = `${block}::${rate}`;
    const e = (blocks[key] = blocks[key] || { block, rate, assets: [], saleProceeds: 0, disposedCount: 0 });
    e.saleProceeds += Number(d.sale_value || 0);
    e.disposedCount += 1;
  }

  const t = opts.transaction || (await sequelize.transaction());
  const ownTx = !opts.transaction;
  const summary = { client_id: clientId, fiscal_year: fy, blocks: [], total_depreciation: 0 };
  try {
    // idempotent: clear any prior computation for this client+FY
    const priorLedgers = await ItActBlockLedger.findAll({ where: { client_id: clientId, fiscal_year: fy }, transaction: t });
    if (priorLedgers.length) {
      await ItActBlockAssetAlloc.destroy({ where: { client_id: clientId, fiscal_year: fy }, transaction: t });
      await ItActBlockLedger.destroy({ where: { client_id: clientId, fiscal_year: fy }, transaction: t });
    }

    let processedAssets = 0; // CR-DEP-01b progress
    for (const key of Object.keys(blocks)) {
      const { block, rate, assets: blkAssets, saleProceeds, disposedCount } = blocks[key];

      // opening WDV = prior FY closing for this block
      const prior = await ItActBlockLedger.findOne({ where: { client_id: clientId, it_act_block: block, fiscal_year: prevFy }, transaction: t });
      let openingWdv = prior ? Number(prior.closing_wdv) : 0;
      let bootstrapOpening = false;

      let additionsFull = 0, additionsHalf = 0;
      const allocInputs = [];
      for (const a of blkAssets) {
        const ptu = a.put_to_use_date || a.purchase_date;
        const h = additionHalfYear(ptu, startYear);
        const cost = costOf(a);
        if (h.isAddition) {
          if (h.half) { additionsHalf += cost; allocInputs.push({ asset_id: a.id, opening_wdv: 0, addition: cost, half: true, flag: 'HALF' }); }
          else { additionsFull += cost; allocInputs.push({ asset_id: a.id, opening_wdv: 0, addition: cost, half: false, flag: 'FULL' }); }
        } else if (new Date(ptu) < start) {
          // pre-FY asset: part of opening. If no prior ledger exists, bootstrap opening from its cost
          // (undepreciated) — for accurate multi-year, run from the earliest acquisition FY (P4 recompute).
          if (!prior) { openingWdv += cost; bootstrapOpening = true; }
          allocInputs.push({ asset_id: a.id, opening_wdv: prior ? 0 : cost, addition: 0, half: false, flag: 'NONE' });
        }
      }
      if (bootstrapOpening) {
        logger.warn('itact.bootstrap_opening_wdv', { client_id: clientId, fiscal_year: fy, it_act_block: block, note: 'no prior-FY ledger; opening seeded from undepreciated cost of pre-FY assets — run P4 recompute FY-by-FY for accuracy' });
      }

      const blockCeased = blkAssets.length === 0 && disposedCount > 0; // no active assets remain
      const res = computeBlock({ openingWdv, additionsFull, additionsHalf, rate, saleProceeds, blockCeased });

      const ledger = await ItActBlockLedger.create({
        client_id: clientId, it_act_block: block, it_act_rate: rate, fiscal_year: fy,
        opening_wdv: res.opening_wdv, additions_full: res.additions_full, additions_half: res.additions_half,
        sale_proceeds: res.sale_proceeds, depreciation: res.depreciation, closing_wdv: res.closing_wdv,
        short_term_capital_gain: res.short_term_capital_gain, short_term_capital_loss: res.short_term_capital_loss,
        block_ceased: res.block_ceased,
        status: 'POSTED', computed_at: new Date(),
      }, { transaction: t });

      const alloc = allocateToAssets(allocInputs, res.depreciation);
      const allocById = Object.fromEntries(alloc.map((x) => [x.asset_id, x.allocated_depreciation]));
      const allocRows = allocInputs.map((ai) => ({
        block_ledger_id: ledger.id, client_id: clientId, asset_id: ai.asset_id, fiscal_year: fy,
        opening_wdv: ai.opening_wdv, addition: ai.addition, addition_flag: ai.flag,
        allocated_depreciation: allocById[ai.asset_id] || 0,
        closing_wdv: Number(ai.opening_wdv) + Number(ai.addition) - (allocById[ai.asset_id] || 0),
      }));
      if (allocRows.length) await ItActBlockAssetAlloc.bulkCreate(allocRows, { transaction: t });

      summary.blocks.push({ block, rate, opening: res.opening_wdv, additions_full: res.additions_full, additions_half: res.additions_half, sale_proceeds: res.sale_proceeds, depreciation: res.depreciation, closing: res.closing_wdv, stcg: res.short_term_capital_gain, stcl: res.short_term_capital_loss, ceased: res.block_ceased, assets: blkAssets.length });
      summary.total_depreciation += res.depreciation;
      processedAssets += blkAssets.length;
      if (typeof opts.onProgress === 'function') {
        try { await opts.onProgress({ processed: processedAssets, total: assets.length, posted: summary.blocks.length }); } catch { /* progress best-effort */ }
      }
    }

    if (ownTx) await t.commit();
    summary.total_depreciation = Math.round(summary.total_depreciation * 100) / 100;
    return summary;
  } catch (e) {
    if (ownTx) await t.rollback();
    throw e;
  }
}

module.exports = { runItActBlock };
