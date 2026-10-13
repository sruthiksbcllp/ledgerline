'use strict';
/**
 * CR-DEP-P2a — Income Tax Act, Section 32 BLOCK-OF-ASSETS annual depreciation (pure math).
 *
 * Depreciation is annual, on a BLOCK (assets grouped by class + rate), on the block's WDV:
 *   normal-rate base = opening_wdv + additions_full        (assets used >= 180 days that FY)
 *   half-rate base   = additions_half                       (assets put to use < 180 days that FY)
 *   depreciation     = normal_base * rate + half_base * (rate / 2)
 *   closing_wdv      = opening_wdv + additions_full + additions_half - depreciation
 *
 * No residual value (block depreciates toward zero). Disposals (sale proceeds reducing the block,
 * block-empty short-term capital gain/loss) are OUT OF SCOPE here — handled in P2b. So this file
 * assumes sale_proceeds = 0 and never drives a block negative.
 *
 * The half-year concession applies ONLY in an asset's acquisition FY; from the next FY the asset
 * sits in opening_wdv and attracts the full rate.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// FY window for an Indian financial year starting 1 Apr. Returns {start, end}.
function fyWindow(fiscalYear) {
  // fiscalYear can be a start-year number (2026) or "2026-27" string.
  const startYear = Number(String(fiscalYear).slice(0, 4));
  return { start: new Date(startYear, 3, 1), end: new Date(startYear + 1, 2, 31) };
}

// Days an asset was "put to use" within the FY (from put_to_use_date to FY end, inclusive).
// >= 180 => full rate; < 180 => half rate. Assets put to use before the FY are opening, not additions.
function additionHalfYear(putToUseDate, fiscalYear) {
  const { start, end } = fyWindow(fiscalYear);
  const ptu = new Date(putToUseDate);
  if (ptu < start) return { isAddition: false };          // belongs to opening WDV
  if (ptu > end) return { isAddition: false };            // future FY
  const days = Math.floor((end - ptu) / (1000 * 60 * 60 * 24)) + 1;
  return { isAddition: true, half: days < 180, days };
}

/**
 * Pure block depreciation (Section 32) + disposals (Section 50). rate is a percentage.
 *   openingWdv: WDV carried from prior FY (0 for a new block).
 *   additionsFull / additionsHalf: cost of assets added this FY at full / half rate.
 *   saleProceeds: moneys received on assets sold from the block this FY (P2b; 0 in P2a).
 *   blockCeased: true when the block has NO active assets remaining after this FY's disposals.
 * Cases:
 *   A. saleProceeds >= gross  -> block WDV 0, NO depreciation, short-term capital GAIN.
 *   B. blockCeased & afterSale>0 -> block ceases, NO depreciation, short-term capital LOSS.
 *   C. otherwise -> depreciate the reduced base (proceeds reduce full-rate base first, then half).
 * With saleProceeds=0 and blockCeased=false this is byte-identical to the P2a result.
 */
function computeBlock({ openingWdv = 0, additionsFull = 0, additionsHalf = 0, rate = 0, saleProceeds = 0, blockCeased = false }) {
  const r = Number(rate) / 100;
  const opening = Number(openingWdv), full = Number(additionsFull), half = Number(additionsHalf), sale = Number(saleProceeds) || 0;
  const gross = opening + full + half;
  const afterSale = gross - sale;

  let depreciation = 0, stcg = 0, stcl = 0, closingWdv = 0, ceased = false;
  if (sale > 0 && sale >= gross) {
    // Case A — proceeds exceed (or equal) the block: WDV to 0, no dep, short-term capital gain.
    stcg = sale - gross; ceased = true;
  } else if (blockCeased) {
    // Case B — block physically empty with WDV remaining: no dep, short-term capital loss.
    stcl = afterSale; ceased = true;
  } else {
    // Case C — block continues: depreciate the reduced base (proceeds reduce full then half).
    const normalBase = Math.max(0, opening + full - sale);
    const remainingSale = Math.max(0, sale - (opening + full));
    const halfBase = Math.max(0, half - remainingSale);
    depreciation = normalBase * r + halfBase * (r / 2);
    closingWdv = afterSale - depreciation;
  }
  return {
    opening_wdv: round2(openingWdv),
    additions_full: round2(additionsFull),
    additions_half: round2(additionsHalf),
    sale_proceeds: round2(sale),
    rate: Number(rate),
    depreciation: round2(depreciation),
    closing_wdv: round2(Math.max(0, closingWdv)),
    short_term_capital_gain: round2(stcg),
    short_term_capital_loss: round2(stcl),
    block_ceased: ceased,
  };
}

/**
 * Allocate a block's annual depreciation to its constituent assets for FAR presentation only
 * (the filing number is the block total). Weight = opening WDV (full) + addition (half-weighted).
 * Returns [{ asset_id, weight, allocated_depreciation }], summing (within rounding) to block dep.
 */
function allocateToAssets(assets, blockDepreciation) {
  const weighted = assets.map((a) => {
    const opening = Number(a.opening_wdv || 0);
    const add = Number(a.addition || 0);
    const weight = a.half ? opening + add * 0.5 : opening + add;
    return { asset_id: a.asset_id, weight };
  });
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  let allocated = 0;
  const out = weighted.map((w, i) => {
    let dep = totalWeight > 0 ? (w.weight / totalWeight) * blockDepreciation : 0;
    dep = round2(dep);
    allocated += dep;
    return { asset_id: w.asset_id, weight: round2(w.weight), allocated_depreciation: dep };
  });
  // push rounding remainder onto the largest allocation so the sum ties to the block total
  const remainder = round2(blockDepreciation - allocated);
  if (out.length && Math.abs(remainder) >= 0.01) {
    const idx = out.reduce((mi, o, i, arr) => (o.allocated_depreciation > arr[mi].allocated_depreciation ? i : mi), 0);
    out[idx].allocated_depreciation = round2(out[idx].allocated_depreciation + remainder);
  }
  return out;
}

module.exports = { computeBlock, allocateToAssets, additionHalfYear, fyWindow, round2 };
