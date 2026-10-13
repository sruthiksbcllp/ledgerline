'use strict';
const { Op } = require('sequelize');
const { Asset, AssetAccounting, AssetCategory, Department, DepreciationLedger, sequelize } = require('../models');
const { getClientId, buildAdminWhere } = require('../utils/tenantFilter');

// ── Gap 3: Component Replacement ──────────────────────────────────────────────
exports.replaceComponent = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const clientId = getClientId(req);
    const oldComponent = await Asset.findByPk(req.params.id, { include: [{ model: AssetAccounting }], transaction: t });
    if (!oldComponent) return res.status(404).json({ success: false, message: 'Component not found' });
    if (!oldComponent.parent_asset_id) return res.status(400).json({ success: false, message: 'Asset is not a component' });

    const { component_name, cost, useful_life, residual_value, depreciation_method, replacement_reason } = req.body;

    // Retire old component
    await oldComponent.update({
      is_retired_component: true,
      is_active: false,
      asset_status: 'DISPOSED',
      replacement_date: new Date(),
      replacement_reason: replacement_reason || 'Component replacement'
    }, { transaction: t });

    // Create new component
    const parent = await Asset.findByPk(oldComponent.parent_asset_id, { transaction: t });
    const existingCount = await Asset.count({ where: { parent_asset_id: parent.id }, transaction: t });
    const compCode = `${parent.asset_code}-C${(existingCount + 1).toString().padStart(2, '0')}`;
    const uLife = Number(useful_life || oldComponent.useful_life || 5);
    const retDate = new Date(); retDate.setFullYear(retDate.getFullYear() + uLife);

    const newComp = await Asset.create({
      client_id: parent.client_id, company_id: parent.company_id,
      asset_name: parent.asset_name, asset_code: compCode,
      component_name: component_name || oldComponent.component_name,
      parent_asset_id: parent.id, is_component_parent: false,
      category_id: parent.category_id, department_id: parent.department_id,
      location_id: parent.location_id, purchase_date: new Date(),
      put_to_use_date: new Date(), purchase_cost: cost,
      total_cost: cost, useful_life: uLife,
      residual_value: residual_value || 0,
      depreciation_method: depreciation_method || 'SLM',
      is_active: true, asset_status: 'ACTIVE', created_by: req.user?.id
    }, { transaction: t });

    await AssetAccounting.create({
      asset_id: newComp.id, cost_of_purchase: cost,
      date_of_put_in_place: new Date(), date_of_retirement: retDate,
      original_useful_life_years: uLife, residual_value: residual_value || 0,
      method_of_depreciation: depreciation_method || 'SLM'
    }, { transaction: t });

    await oldComponent.update({ replaced_by_id: newComp.id }, { transaction: t });

    // Update parent total cost
    const allComps = await Asset.findAll({ where: { parent_asset_id: parent.id, is_active: true }, transaction: t });
    const newTotal = allComps.reduce((s, c) => s + Number(c.purchase_cost || 0), 0);
    await parent.update({ purchase_cost: newTotal, total_cost: newTotal }, { transaction: t });

    await t.commit();
    res.json({ success: true, data: { retired: oldComponent.id, new_component: newComp.id, new_code: compCode }, message: 'Component replaced successfully' });
  } catch (err) { await t.rollback(); res.status(500).json({ success: false, message: err.message }); }
};

exports.getReplacementHistory = async (req, res) => {
  try {
    const components = await Asset.findAll({
      where: { parent_asset_id: req.params.parentId, is_retired_component: true, ...buildAdminWhere(req) },
      attributes: ['id', 'asset_code', 'component_name', 'purchase_cost', 'replacement_date', 'replacement_reason', 'replaced_by_id'],
      order: [['replacement_date', 'DESC']]
    });
    res.json({ success: true, data: components });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 4: Asset Revaluation ──────────────────────────────────────────────────
exports.revalueAsset = async (req, res) => {
  try {
    const { revalueAsset } = require('../services/revaluation.service');
    const result = await revalueAsset({
      assetId: req.body.asset_id || req.params.id,
      fairValue: req.body.fair_value,
      revaluationDate: req.body.revaluation_date,
      valuerName: req.body.valuer_name,
      valuerReportRef: req.body.valuer_report_ref,
      remarks: req.body.remarks,
      userId: req.user?.id,
      clientId: getClientId(req)
    });
    res.json({ success: true, data: result, message: 'Asset revalued successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getRevaluationHistory = async (req, res) => {
  try {
    const { getRevaluationHistory } = require('../services/revaluation.service');
    const ownedAsset = await Asset.findOne({ where: { id: req.params.assetId, ...buildAdminWhere(req) } });
    if (!ownedAsset) return res.status(404).json({ success: false, message: 'Asset not found' });
    const data = await getRevaluationHistory(req.params.assetId);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 5: Inter-company Transfer ─────────────────────────────────────────────
exports.createTransfer = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const { asset_id, to_company_id, transfer_value, transfer_reason } = req.body;
    const asset = await Asset.findByPk(asset_id, { include: [{ model: AssetAccounting }] });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });

    const cost = Number(asset.AssetAccounting?.cost_of_purchase || asset.purchase_cost || 0);
    const lastLedger = await DepreciationLedger.findOne({
      where: { asset_id }, order: [['fiscal_year', 'DESC'], ['period_month', 'DESC']]
    });
    const accDep = Number(lastLedger?.accumulated_depreciation || 0);
    const nbv = cost - accDep;
    const gainLoss = Number(transfer_value || 0) - nbv;

    const { AssetTransfer } = require('../models');
    const transfer = await AssetTransfer.create({
      asset_id, client_id: clientId,
      from_company_id: asset.company_id, to_company_id,
      transfer_date: new Date(), transfer_value: transfer_value || nbv,
      nbv_at_transfer: nbv, gain_loss: gainLoss,
      transfer_reason, status: 'PENDING', created_by: req.user?.id
    });
    res.status(201).json({ success: true, data: transfer, message: 'Transfer request created' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.approveTransfer = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { AssetTransfer } = require('../models');
    const transfer = await AssetTransfer.findOne({ where: { id: req.params.id, ...buildAdminWhere(req) }, transaction: t });
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
    if (transfer.status !== 'PENDING') return res.status(400).json({ success: false, message: 'Transfer is not pending' });

    const action = req.body?.action || (req.path.endsWith('/reject') ? 'reject' : 'approve');
    if (action === 'reject') {
      await transfer.update({ status: 'REJECTED' }, { transaction: t });
      await t.commit();
      return res.json({ success: true, message: 'Transfer rejected' });
    }

    // Update asset ownership
    await Asset.update({ company_id: transfer.to_company_id }, { where: { id: transfer.asset_id }, transaction: t });

    // Wire GL posting
    try {
      const glPostingService = require('../services/glPostingService');
      if (typeof glPostingService.postTransfer === 'function') {
        // FIX: align to the service signature { clientId, asset, fromCompanyName, toCompanyName, transferValue }.
        const { Company } = require('../models');
        const glAsset = await Asset.findByPk(transfer.asset_id, { transaction: t });
        const fromCo = transfer.from_company_id ? await Company.findByPk(transfer.from_company_id, { transaction: t }) : null;
        const toCo = transfer.to_company_id ? await Company.findByPk(transfer.to_company_id, { transaction: t }) : null;
        const posted = await glPostingService.postTransfer({
          clientId: transfer.client_id,
          asset: glAsset,
          fromCompanyName: (fromCo && fromCo.company_name) || `Company ${transfer.from_company_id}`,
          toCompanyName: (toCo && toCo.company_name) || `Company ${transfer.to_company_id}`,
          transferValue: transfer.transfer_value
        });
        if (posted) await transfer.update({ gl_posted: true }, { transaction: t }); // only when enqueue actually returned
      }
    } catch { /* GL is non-blocking */ }

    await transfer.update({
      status: 'COMPLETED', approved_by: req.user?.id, approved_at: new Date()
    }, { transaction: t });
    await t.commit();
    res.json({ success: true, message: 'Transfer approved and completed' });
  } catch (err) { await t.rollback(); res.status(500).json({ success: false, message: err.message }); }
};

exports.getTransfers = async (req, res) => {
  try {
    const { AssetTransfer } = require('../models');
    const clientId = getClientId(req);
    const where = {};
    if (clientId) where.client_id = clientId;
    if (req.query.status) where.status = req.query.status;
    const transfers = await AssetTransfer.findAll({
      where, include: [{ model: Asset, attributes: ['id', 'asset_code', 'asset_name'] }],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: transfers });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 6: Asset Merge ────────────────────────────────────────────────────────
exports.mergeAssets = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const clientId = getClientId(req);
    const { asset_ids, merged_asset_name, category_id, department_id, location_id } = req.body;
    if (!asset_ids || asset_ids.length < 2) return res.status(400).json({ success: false, message: 'At least 2 assets required' });

    const assets = await Asset.findAll({
      where: { id: asset_ids }, include: [{ model: AssetAccounting }], transaction: t
    });
    if (assets.length !== asset_ids.length) return res.status(400).json({ success: false, message: 'Some assets not found' });

    let totalCost = 0, totalAccDep = 0;
    for (const a of assets) {
      totalCost += Number(a.AssetAccounting?.cost_of_purchase || a.purchase_cost || 0);
      const ledger = await DepreciationLedger.findOne({
        where: { asset_id: a.id }, order: [['fiscal_year', 'DESC'], ['period_month', 'DESC']], transaction: t
      });
      totalAccDep += Number(ledger?.accumulated_depreciation || 0);
    }

    // Create merged asset
    const first = assets[0];
    const mergedAsset = await Asset.create({
      client_id: clientId, company_id: first.company_id,
      asset_name: merged_asset_name || `Merged: ${assets.map(a => a.asset_code).join('+')}`,
      asset_code: `MERGED-${Date.now()}`,
      category_id: category_id || first.category_id,
      department_id: department_id || first.department_id,
      location_id: location_id || first.location_id,
      purchase_date: first.purchase_date, put_to_use_date: first.put_to_use_date,
      purchase_cost: totalCost, total_cost: totalCost,
      useful_life: first.useful_life, depreciation_method: first.depreciation_method || 'SLM',
      is_active: true, asset_status: 'ACTIVE', created_by: req.user?.id
    }, { transaction: t });

    await AssetAccounting.create({
      asset_id: mergedAsset.id, cost_of_purchase: totalCost,
      date_of_put_in_place: first.put_to_use_date || first.purchase_date,
      date_of_retirement: first.AssetAccounting?.date_of_retirement || new Date(new Date().getFullYear() + 10, 0, 1),
      original_useful_life_years: first.AssetAccounting?.original_useful_life_years || first.useful_life || 10,
      method_of_depreciation: first.AssetAccounting?.method_of_depreciation || 'SLM'
    }, { transaction: t });

    // Retire originals
    for (const a of assets) {
      await a.update({ is_active: false, asset_status: 'MERGED' }, { transaction: t });
    }

    // Log merge
    const { AssetMerge } = require('../models');
    await AssetMerge.create({
      client_id: clientId, merged_asset_id: mergedAsset.id,
      source_asset_ids: asset_ids, total_cost: totalCost,
      total_accumulated_depreciation: totalAccDep, merge_date: new Date(),
      created_by: req.user?.id
    }, { transaction: t });

    await t.commit();
    res.json({ success: true, data: { merged_asset_id: mergedAsset.id, source_count: assets.length, total_cost: totalCost }, message: 'Assets merged successfully' });
  } catch (err) { await t.rollback(); res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 9: Forecasting ────────────────────────────────────────────────────────
exports.getReplacementForecast = async (req, res) => {
  try {
    const { generateReplacementForecast } = require('../services/forecasting.service');
    const clientId = getClientId(req);
    const data = await generateReplacementForecast(clientId, {
      horizonYears: Number(req.query.horizon_years || req.query.horizon || 5),
      inflationRate: Number(req.query.inflation_rate || req.query.inflation || 5)
    });
    // Reshape for frontend: yearly_forecast with count/total_replacement_cost/total_original_cost
    const yearly_forecast = (data.projections || []).map(p => ({
      year: p.year,
      count: p.assetCount,
      total_replacement_cost: p.totalCost,
      total_original_cost: p.replacements.reduce((s, r) => s + (r.original_cost || 0), 0),
      assets: p.replacements
    }));
    res.json({ success: true, data: {
      yearly_forecast,
      horizon_years: data.horizon_years,
      inflation_rate: data.inflation_rate,
      summary: data.summary
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getWhatIfScenario = async (req, res) => {
  try {
    const { generateWhatIfScenario } = require('../services/forecasting.service');
    const clientId = getClientId(req);
    const p = { ...req.query, ...req.body }; // POST body + query params
    const data = await generateWhatIfScenario(clientId, {
      horizonYears: Number(p.horizon_years || p.horizon || 5),
      inflationRate: Number(p.inflation_rate || p.inflation || 5),
      usefulLifeOverride: p.useful_life_override ? Number(p.useful_life_override) : undefined,
      categoryId: p.category_id ? Number(p.category_id) : undefined
    });
    // Reshape for frontend consistency
    const yearly_forecast = [];
    const byYear = {};
    for (const a of (data.assets || [])) {
      if (!byYear[a.replacement_year]) byYear[a.replacement_year] = { year: a.replacement_year, count: 0, total_replacement_cost: 0, total_original_cost: 0, assets: [] };
      byYear[a.replacement_year].count++;
      byYear[a.replacement_year].total_replacement_cost += a.projected_replacement_cost;
      byYear[a.replacement_year].total_original_cost += a.original_cost;
      byYear[a.replacement_year].assets.push(a);
    }
    Object.keys(byYear).sort().forEach(y => yearly_forecast.push(byYear[y]));
    res.json({ success: true, data: { yearly_forecast, scenario: data.scenario, total_projected_cost: data.total_projected_cost }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 10: Cost Center ───────────────────────────────────────────────────────
exports.getCostCenters = async (req, res) => {
  try {
    const { CostCenter, User } = require('../models');
    const clientId = getClientId(req);
    const where = {};
    if (clientId) where.client_id = clientId;
    const data = await CostCenter.findAll({
      where,
      include: [
        { model: User, as: 'owner', attributes: ['id', 'first_name', 'last_name', 'email'], required: false },
        { model: User, as: 'approver', attributes: ['id', 'first_name', 'last_name', 'email'], required: false }
      ],
      order: [['code', 'ASC']]
    });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createCostCenter = async (req, res) => {
  try {
    const { CostCenter } = require('../models');
    const { code, name, parent_id, level, is_active, owner_id, approver_id, sub_ledger, allocation_owner_id, owner_name, approver_name, allocation_owner_name } = req.body;
    const cc = await CostCenter.create({
      code, name, parent_id, level, is_active, owner_id, approver_id, sub_ledger, allocation_owner_id,
      owner_name, approver_name, allocation_owner_name,
      client_id: getClientId(req)
    });
    res.status(201).json({ success: true, data: cc, message: 'Cost center created' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateCostCenter = async (req, res) => {
  try {
    const { CostCenter } = require('../models');
    const clientId = getClientId(req);
    const where = { id: req.params.id };
    if (clientId) where.client_id = clientId;
    const cc = await CostCenter.findOne({ where });
    if (!cc) return res.status(404).json({ success: false, message: 'Not found' });
    const { code, name, parent_id, level, is_active, owner_id, approver_id, sub_ledger, allocation_owner_id, owner_name, approver_name, allocation_owner_name } = req.body;
    await cc.update({ code, name, parent_id, level, is_active, owner_id, approver_id, sub_ledger, allocation_owner_id, owner_name, approver_name, allocation_owner_name });
    res.json({ success: true, data: cc, message: 'Cost center updated' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.allocateAssetToCostCenters = async (req, res) => {
  try {
    const { AssetCostAllocation, Asset } = require('../models');
    const { asset_id, allocations } = req.body;
    // Tenant check on asset
    const clientId = getClientId(req);
    if (clientId) {
      const asset = await Asset.findOne({ where: { id: asset_id, client_id: clientId } });
      if (!asset) return res.status(404).json({ success: false, message: 'Asset not found in your tenant' });
    }
    const total = allocations.reduce((s, a) => s + Number(a.allocation_percentage || 0), 0);
    if (Math.abs(total - 100) > 0.01) return res.status(400).json({ success: false, message: 'Allocations must sum to 100%' });

    await AssetCostAllocation.destroy({ where: { asset_id } });
    const rows = [];
    for (const alloc of allocations) {
      rows.push(await AssetCostAllocation.create({ asset_id, ...alloc, effective_from: new Date() }));
    }
    res.json({ success: true, data: rows, message: 'Cost allocations saved' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getAssetAllocations = async (req, res) => {
  try {
    const { AssetCostAllocation, CostCenter, Asset } = require('../models');
    // Tenant check on asset
    const clientId = getClientId(req);
    if (clientId) {
      const asset = await Asset.findOne({ where: { id: req.params.assetId, client_id: clientId } });
      if (!asset) return res.status(404).json({ success: false, message: 'Asset not found in your tenant' });
    }
    const data = await AssetCostAllocation.findAll({
      where: { asset_id: req.params.assetId },
      include: [{ model: CostCenter, as: 'costCenter' }]
    });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Bulk import cost centres (CSV/XLSX parsed client-side -> [{code,name,level?}]). Idempotent upsert by (client_id, code).
exports.importCostCenters = async (req, res) => {
  try {
    const { CostCenter } = require('../models');
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, message: 'Tenant context required' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: 'No rows supplied' });
    let created = 0, updated = 0, skipped = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const code = String(rows[i].code ?? '').trim();
      const name = String(rows[i].name ?? '').trim();
      if (!code) { skipped++; errors.push(`Row ${i + 1}: missing code`); continue; }
      const level = String(rows[i].level ?? 'DEPARTMENT').trim().toUpperCase();
      const [row, isNew] = await CostCenter.findOrCreate({
        where: { client_id: clientId, code },
        defaults: { client_id: clientId, code, name: name || code, level: ['COMPANY','BUSINESS_UNIT','DEPARTMENT','SUB_DEPARTMENT'].includes(level) ? level : 'DEPARTMENT', is_active: true }
      });
      if (isNew) created++;
      else { await row.update({ name: name || row.name }); updated++; }
    }
    res.json({ success: true, message: `Imported: ${created} created, ${updated} updated, ${skipped} skipped`, data: { created, updated, skipped, errors: errors.slice(0, 50) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 11: GL Account Mapping ────────────────────────────────────────────────
exports.getGLMappings = async (req, res) => {
  try {
    const { GLAccountMapping, AssetCategory, CostCenter } = require('../models');
    const clientId = getClientId(req);
    const where = {};
    if (clientId) where.client_id = clientId;
    const rows = await GLAccountMapping.findAll({ where, order: [['event_type', 'ASC']] });
    // attach category/cost-centre names (no model association defined) for display
    const catWhere = clientId ? { client_id: clientId } : {};
    const cats = await AssetCategory.findAll({ where: catWhere, attributes: ['id', 'category_name'] });
    const ccs = await CostCenter.findAll({ where: catWhere, attributes: ['id', 'code', 'name'] });
    const catMap = {}; cats.forEach(c => { catMap[c.id] = c.category_name; });
    const ccMap = {}; ccs.forEach(c => { ccMap[c.id] = `${c.code} — ${c.name}`; });
    const data = rows.map(r => {
      const o = r.toJSON();
      o.category_name = o.category_id ? (catMap[o.category_id] || `#${o.category_id}`) : null;
      o.cost_center_label = o.cost_center_id ? (ccMap[o.cost_center_id] || `#${o.cost_center_id}`) : null;
      return o;
    });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Bulk import GL mappings (CSV/XLSX parsed client-side). Resolves category by name.
// Idempotent upsert by (client_id, category_id, cost_center_id, event_type).
exports.importGLMappings = async (req, res) => {
  try {
    const { GLAccountMapping, AssetCategory } = require('../models');
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, message: 'Tenant context required' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: 'No rows supplied' });
    const cats = await AssetCategory.findAll({ where: { client_id: clientId }, attributes: ['id', 'category_name'] });
    const norm = (x) => String(x || '').trim().toLowerCase().replace(/[\s\-_/&().]+/g, '');
    const catByName = {}; cats.forEach(c => { catByName[norm(c.category_name)] = c.id; });
    const VALID = ['ACQUISITION','DEPRECIATION','DISPOSAL','TRANSFER','REVALUATION'];
    let created = 0, updated = 0, skipped = 0; const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const event_type = String(r.event_type || '').trim().toUpperCase();
      if (!VALID.includes(event_type)) { skipped++; errors.push(`Row ${i + 1}: invalid event_type "${r.event_type}"`); continue; }
      const dr = String(r.debit_account_code || '').trim();
      const cr = String(r.credit_account_code || '').trim();
      if (!dr || !cr) { skipped++; errors.push(`Row ${i + 1}: debit/credit code required`); continue; }
      let category_id = r.category_id ? Number(r.category_id) : null;
      if (!category_id && r.category_name) {
        category_id = catByName[norm(r.category_name)] || null;
        if (!category_id) { skipped++; errors.push(`Row ${i + 1}: category "${r.category_name}" not found in tenant`); continue; }
      }
      const [row, isNew] = await GLAccountMapping.findOrCreate({
        where: { client_id: clientId, category_id: category_id || null, cost_center_id: r.cost_center_id || null, event_type },
        defaults: {
          client_id: clientId, category_id: category_id || null, cost_center_id: r.cost_center_id || null, event_type,
          debit_account_code: dr, debit_account_name: r.debit_account_name || null,
          credit_account_code: cr, credit_account_name: r.credit_account_name || null, is_active: true
        }
      });
      if (isNew) created++;
      else { await row.update({ debit_account_code: dr, debit_account_name: r.debit_account_name || row.debit_account_name, credit_account_code: cr, credit_account_name: r.credit_account_name || row.credit_account_name }); updated++; }
    }
    res.json({ success: true, message: `Imported: ${created} created, ${updated} updated, ${skipped} skipped`, data: { created, updated, skipped, errors: errors.slice(0, 50) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.upsertGLMapping = async (req, res) => {
  try {
    const { GLAccountMapping } = require('../models');
    const clientId = getClientId(req);
    const { id, ...body } = req.body;
    if (id) {
      const row = await GLAccountMapping.findOne({ where: { id, ...buildAdminWhere(req) } });
      if (!row) return res.status(404).json({ success: false, message: 'Not found' });
      await row.update(body);
      return res.json({ success: true, data: row, message: 'GL mapping updated' });
    }
    const row = await GLAccountMapping.create({ ...body, client_id: clientId });
    res.status(201).json({ success: true, data: row, message: 'GL mapping created' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteGLMapping = async (req, res) => {
  try {
    const { GLAccountMapping } = require('../models');
    await GLAccountMapping.destroy({ where: { id: req.params.id, ...buildAdminWhere(req) } });
    res.json({ success: true, message: 'GL mapping deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 12: FAR Period Lock ───────────────────────────────────────────────────
exports.lockPeriod = async (req, res) => {
  try {
    const { FarPeriodLock } = require('../models');
    const clientId = getClientId(req);
    const lock = await FarPeriodLock.create({
      client_id: clientId, period_end: req.body.period_end,
      locked_by: req.user?.id, remarks: req.body.remarks,
      digital_signature_hash: require('crypto').createHash('sha256')
        .update(`${clientId}|${req.body.period_end}|${req.user?.id}|${Date.now()}`).digest('hex')
    });
    res.json({ success: true, data: lock, message: `Period locked until ${req.body.period_end}` });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ success: false, message: 'Period already locked' });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPeriodLocks = async (req, res) => {
  try {
    const { FarPeriodLock, User } = require('../models');
    const clientId = getClientId(req);
    const rows = await FarPeriodLock.findAll({ where: { client_id: clientId }, order: [['period_end', 'DESC']] });
    // Resolve locked_by (a user id) to a readable name so the UI shows a person, not "311".
    const ids = [...new Set(rows.map((r) => r.locked_by).filter(Boolean))];
    const users = ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id', 'first_name', 'last_name', 'username'] }) : [];
    const nameById = {};
    users.forEach((u) => { nameById[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || String(u.id); });
    const data = rows.map((r) => { const p = r.get({ plain: true }); p.locked_by_name = nameById[r.locked_by] || (r.locked_by != null ? String(r.locked_by) : ''); return p; });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 13: Audit Findings ────────────────────────────────────────────────────
exports.createFinding = async (req, res) => {
  try {
    const { AuditFinding } = require('../models');
    const finding = await AuditFinding.create({ ...req.body, client_id: getClientId(req), created_by: req.user?.id });
    res.status(201).json({ success: true, data: finding, message: 'Audit finding created' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getFindings = async (req, res) => {
  try {
    const { AuditFinding } = require('../models');
    const clientId = getClientId(req);
    const where = {};
    if (clientId) where.client_id = clientId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.severity) where.severity = req.query.severity;
    if (req.query.audit_plan_id) where.audit_plan_id = req.query.audit_plan_id;
    const data = await AuditFinding.findAll({ where, order: [['created_at', 'DESC']] });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateFinding = async (req, res) => {
  try {
    const { AuditFinding } = require('../models');
    const finding = await AuditFinding.findOne({ where: { id: req.params.id, ...buildAdminWhere(req) } });
    if (!finding) return res.status(404).json({ success: false, message: 'Not found' });
    await finding.update(req.body);
    res.json({ success: true, data: finding, message: 'Finding updated' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 14: Compliance Calendar ───────────────────────────────────────────────
exports.getComplianceCalendar = async (req, res) => {
  try {
    const { ComplianceCalendar } = require('../models');
    const clientId = getClientId(req);
    const where = {};
    if (clientId) where.client_id = clientId;
    const data = await ComplianceCalendar.findAll({ where, order: [['due_date', 'ASC']] });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.upsertComplianceItem = async (req, res) => {
  try {
    const { ComplianceCalendar } = require('../models');
    const { id, ...body } = req.body;
    if (id) {
      const row = await ComplianceCalendar.findByPk(id);
      if (!row) return res.status(404).json({ success: false, message: 'Not found' });
      await row.update(body);
      return res.json({ success: true, data: row, message: 'Updated' });
    }
    const row = await ComplianceCalendar.create({ ...body, client_id: getClientId(req) });
    res.status(201).json({ success: true, data: row, message: 'Compliance item created' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 16: SOD ───────────────────────────────────────────────────────────────
exports.getSODRules = async (req, res) => {
  try {
    const { SodConflictRule } = require('../models');
    const clientId = getClientId(req);
    const where = {};
    if (clientId) where.client_id = clientId;
    const data = await SodConflictRule.findAll({ where });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createSODRule = async (req, res) => {
  try {
    const { SodConflictRule } = require('../models');
    const rule = await SodConflictRule.create({ ...req.body, client_id: getClientId(req) });
    res.status(201).json({ success: true, data: rule, message: 'SOD rule created' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.seedSODRules = async (req, res) => {
  try {
    const { seedDefaultRules } = require('../services/sodService');
    await seedDefaultRules(getClientId(req));
    res.json({ success: true, message: 'Default SOD rules seeded' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getSODViolations = async (req, res) => {
  try {
    const { getViolationReport } = require('../services/sodService');
    const data = await getViolationReport(getClientId(req), {
      startDate: req.query.start_date, endDate: req.query.end_date
    });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Gap 21: Disposal Bids ─────────────────────────────────────────────────────
exports.addDisposalBid = async (req, res) => {
  try {
    const { DisposalBid } = require('../models');
    const { AssetDisposal } = require('../models');
    const parentDisposal = await AssetDisposal.findOne({
      where: { id: req.params.disposalId },
      include: [{ model: Asset, required: true, where: buildAdminWhere(req) }]
    });
    if (!parentDisposal) return res.status(404).json({ success: false, message: 'Disposal not found' });
    const bid = await DisposalBid.create({ disposal_id: req.params.disposalId, client_id: getClientId(req), ...req.body });
    res.status(201).json({ success: true, data: bid, message: 'Bid added' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getDisposalBids = async (req, res) => {
  try {
    const { DisposalBid } = require('../models');
    const { AssetDisposal } = require('../models');
    const parentDisposal = await AssetDisposal.findOne({
      where: { id: req.params.disposalId },
      include: [{ model: Asset, required: true, where: buildAdminWhere(req) }]
    });
    if (!parentDisposal) return res.status(404).json({ success: false, message: 'Disposal not found' });
    const data = await DisposalBid.findAll({ where: { disposal_id: req.params.disposalId }, order: [['bid_amount', 'DESC']] });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.selectBid = async (req, res) => {
  try {
    const { DisposalBid } = require('../models');
    const { AssetDisposal } = require('../models');
    const parentDisposal = await AssetDisposal.findOne({
      where: { id: req.params.disposalId },
      include: [{ model: Asset, required: true, where: buildAdminWhere(req) }]
    });
    if (!parentDisposal) return res.status(404).json({ success: false, message: 'Disposal not found' });
    await DisposalBid.update({ is_selected: false }, { where: { disposal_id: req.params.disposalId } });
    await DisposalBid.update({ is_selected: true }, { where: { id: req.params.bidId } });
    res.json({ success: true, message: 'Bid selected' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Gap 7: Advanced Depreciation Calculator
exports.calculateDepreciation = async (req, res) => {
  try {
    const { asset_id, method, params, units_this_period, rate } = req.body;
    const calcParams = params || {};
    if (units_this_period !== undefined) calcParams.units_this_period = units_this_period;
    if (rate !== undefined) calcParams.rate = rate;
    const { Asset, AssetAccounting, AssetCategory } = require('../models');
    const depreciationEngine = require('../utils/depreciationEngine');

    const asset = await Asset.findOne({
      where: { id: asset_id, ...buildAdminWhere(req) },
      include: [
        { model: AssetAccounting },
        { model: AssetCategory, as: 'category' }
      ]
    });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });

    const acc = asset.AssetAccounting || {};
    const costVal = parseFloat(acc.cost_of_purchase || asset.purchase_cost || asset.total_cost || 0);
    const assetData = {
      purchase_cost: costVal,
      total_cost: costVal,
      residual_value: parseFloat(acc.residual_value || asset.residual_value || 0),
      useful_life: parseInt(acc.original_useful_life_years || asset.useful_life || 5, 10),
      put_to_use_date: acc.date_of_put_in_place || asset.put_to_use_date || asset.purchase_date,
      purchase_date: asset.purchase_date,
      wdv_rate: parseFloat(acc.wdv_rate || 15),
      depreciation_method: method || acc.method_of_depreciation || 'SLM',
      accumulated_depreciation_opening: parseFloat(acc.accumulated_dep_opening_balance || asset.accumulated_depreciation_opening || 0),
      companies_act_accumulated: parseFloat(asset.companies_act_accumulated || 0),
      it_act_accumulated: parseFloat(asset.it_act_accumulated || 0),
      it_act_wdv: parseFloat(asset.it_act_wdv || 0),
      opening_wdv: parseFloat(acc.starting_wdv || costVal)
    };

    const result = depreciationEngine.calculateByMethod(assetData, asset.category || {}, method, calcParams);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Gap 8: Budgetary -> FAR conversion
exports.convertBudgetaryToFAR = async (req, res) => {
  try {
    const { asset_id } = req.params;
    const { Asset, AssetAccounting } = require('../models');
    const { getClientId } = require('../utils/tenantFilter');
    const clientId = getClientId(req);

    const asset = await Asset.findOne({ where: { id: asset_id, client_id: clientId, capitalization_status: 'BUDGETARY' } });
    if (!asset) return res.status(404).json({ success: false, message: 'Budgetary asset not found' });

    await asset.update({ capitalization_status: 'CAPITALIZED', capitalized_date: new Date() });
    // Ensure AssetAccounting row exists
    await AssetAccounting.findOrCreate({
      where: { asset_id: asset.id },
      defaults: {
        cost_of_purchase: asset.purchase_cost || asset.total_cost || 0,
        residual_value: asset.residual_value || 0,
        original_useful_life_years: asset.useful_life || 5,
        method_of_depreciation: 'SLM',
        date_of_put_in_place: asset.put_to_use_date || new Date()
      }
    });

    res.json({ success: true, message: 'Budgetary asset converted to FAR', data: asset });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Gap 15: Approval quorum check
exports.checkApprovalQuorum = async (req, res) => {
  try {
    const { module, entity_id } = req.params;
    const { ApprovalMatrix, ApprovalRequest } = require('../models');
    const { getClientId } = require('../utils/tenantFilter');
    const clientId = getClientId(req);

    const matrix = await ApprovalMatrix.findOne({
      where: { module, client_id: clientId, is_active: true }
    });
    if (!matrix) return res.json({ success: true, data: { quorum_met: true, message: 'No approval matrix configured' } });

    const approvals = await ApprovalRequest.findAll({
      where: { module, entity_id, status: 'APPROVED', client_id: clientId }
    });

    const quorumRequired = matrix.min_approvers || 1;
    const quorumMet = approvals.length >= quorumRequired;

    res.json({
      success: true,
      data: {
        quorum_met: quorumMet,
        approvals_received: approvals.length,
        quorum_required: quorumRequired,
        sla_hours: matrix.sla_hours || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Gap 20: Request routing / escalation
exports.escalateRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const { escalation_reason, escalate_to_role } = req.body;
    const { sequelize } = require('../models');
    const { getClientId } = require('../utils/tenantFilter');
    const clientId = getClientId(req);

    // Update request with escalation metadata
    const [updated] = await sequelize.query(
      `UPDATE requests SET status = 'ESCALATED', remarks = CONCAT(COALESCE(remarks,''), '\n[ESCALATED] ', :reason, ' -> ', :role)
       WHERE id = :id AND client_id = :clientId`,
      { replacements: { id: request_id, reason: escalation_reason || '', role: escalate_to_role || 'ADMIN', clientId }, type: sequelize.QueryTypes.UPDATE }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Request not found' });
    res.json({ success: true, message: 'Request escalated', data: { request_id, escalated_to: escalate_to_role } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
