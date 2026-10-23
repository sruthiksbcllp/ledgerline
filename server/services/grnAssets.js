'use strict';
/**
 * Shared GRN -> fixed-asset creation. Used by BOTH the direct GRN path (grn.controller)
 * and the Gate-Entry-generated GRN path (procurement.controller) so assets + AssetAccounting
 * are created identically regardless of how the GRN was raised.
 *
 * acceptedLines: [{ item_id, item_name, unit_price, accepted_quantity, serials?[] }]
 * Creates one asset per accepted unit when the PO is CAPEX (or the item master is a fixed asset).
 */
const { Asset, AssetAccounting, AssetCategory, Item, Vendor, FeatureToggle } = require('../models');
const { getStatusId, STATUS } = require('./statusResolver');

// #9 CAPEX_ONLY_ASSET_CREATION (per-tenant). ON -> ONLY CAPEX POs create assets at GRN.
// Default OFF -> legacy behaviour (byte-identical). Precedence: tenant row -> global row -> OFF.
async function isCapexOnlyAssetCreation(clientId) {
  const row = clientId
    ? await FeatureToggle.findOne({ where: { feature_key: 'CAPEX_ONLY_ASSET_CREATION', client_id: clientId } })
    : null;
  const g = row || await FeatureToggle.findOne({ where: { feature_key: 'CAPEX_ONLY_ASSET_CREATION', client_id: null } });
  return !!(g && g.is_enabled === true);
}

// CAPEX-only when the flag is on; else legacy (CAPEX, or a fixed-asset/categorised item master).
function shouldMakeAsset(po, itemMaster, capexOnly) {
  if (capexOnly) return po.type === 'CAPEX';
  return po.type === 'CAPEX' || !!(itemMaster && (itemMaster.item_type === 'FIXED_ASSET' || itemMaster.category_id));
}

async function createAssetsForGrn({ po, grn, acceptedLines, location_id = null, department_id = null, invoice_number = null, clientId, userId }, transaction) {
  let created = 0;
  let baseCount = await Asset.count();
  // Denormalised procurement strings the Fixed Asset Register displays directly
  // (FAR reads asset.po_number / asset.vendor_name, not the FK joins).
  const poNumber = po.po_number || null;
  const vendorName = (po.Vendor && po.Vendor.vendor_name)
    || (po.vendor_id ? ((await Vendor.findByPk(po.vendor_id))?.vendor_name || null) : null);
  const capexOnly = await isCapexOnlyAssetCreation(clientId);
  for (const line of acceptedLines) {
    const qty = Number(line.accepted_quantity || 0);
    if (qty <= 0) continue;
    const itemMaster = line.item_id ? await Item.findByPk(line.item_id) : null;
    const makeAssets = shouldMakeAsset(po, itemMaster, capexOnly);
    if (!makeAssets) continue;
    const serials = line.serials || [];
    for (let i = 0; i < qty; i++) {
      const asset_code = `AST-${new Date().getFullYear()}-${(baseCount + 1).toString().padStart(6, '0')}`;
      baseCount++;
      const createdAsset = await Asset.create({
        asset_name: (itemMaster && itemMaster.item_name) || line.item_name || 'Asset',
        asset_code,
        serial_number: serials[i] || null,
        category_id: itemMaster ? itemMaster.category_id : null,
        sub_category_id: itemMaster ? itemMaster.sub_category_id : null,
        property_id: po.property_id,
        location_id: location_id || po.location_id || null,
        department_id: department_id || null,
        status_id: await getStatusId(STATUS.ACTIVE),
        vendor_id: po.vendor_id,
        vendor_name: vendorName,
        po_id: po.id,
        po_number: poNumber,
        entity_id: po.entity_id || null,
        grn_id: grn.id,
        invoice_number,
        purchase_date: po.createdAt,
        put_to_use_date: grn.received_date || new Date(),
        purchase_cost: line.unit_price,
        total_cost: line.unit_price,
        source_type: 'GRN',
        is_active: true,
        client_id: clientId,
        created_by: userId
      }, { transaction });
      created++;
      try {
        const cost = Number(line.unit_price || 0);
        let usefulLife = 5, method = 'SLM', residualPct = 5;
        if (itemMaster && itemMaster.category_id) {
          const cat = await AssetCategory.findByPk(itemMaster.category_id);
          if (cat) { usefulLife = Number(cat.useful_life || 5); method = cat.depreciation_method || 'SLM'; residualPct = Number(cat.companies_act_residual_percent || 5); }
        }
        const putToUse = grn.received_date || new Date();
        const retire = new Date(putToUse); retire.setFullYear(retire.getFullYear() + usefulLife);
        const residual = cost * (residualPct / 100);
        await AssetAccounting.create({
          asset_id: createdAsset.id, client_id: clientId,
          cost_of_purchase: cost, original_useful_life_years: usefulLife,
          residual_value: residual, scrap_value: residual,
          method_of_depreciation: method, date_of_put_in_place: putToUse, date_of_retirement: retire,
          wdv_rate: method === 'WDV' ? (100 / usefulLife) : 0, it_act_rate: 0,
          sale_of_asset: 'NO', created_by: userId
        }, { transaction });
      } catch (accErr) { /* accounting sync non-blocking */ }
    }
  }
  return created;
}

module.exports = { createAssetsForGrn, isCapexOnlyAssetCreation, shouldMakeAsset };
