const {
  Asset, AssetAccounting, AssetCategory, AssetSubCategory, Location, Property,
  Department, AssetMovement, AssetIssue, AssetDisposal, AuditSession,
  DepreciationLedger, AssetAuditLog, ActivityLog, sequelize,
  VerificationSession, VerificationDetail, Item, User,
  ItActBlockLedger, ItActBlockAssetAlloc
} = require('../models');
const { Op, fn, col } = require('sequelize');
const { buildAdminWhere } = require('../utils/tenantFilter');

class ReportService {
  buildDepreciationAssetWhere(filters, options = {}) {
    const where = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    if (options.filterFy && filters.fy) where.it_act_fy = filters.fy;
    if (filters.asset_code_from || filters.asset_code_to) {
      where.asset_code = {};
      if (filters.asset_code_from) where.asset_code[Op.gte] = filters.asset_code_from;
      if (filters.asset_code_to) where.asset_code[Op.lte] = filters.asset_code_to;
    }
    return where;
  }

  // Shared include + row-flattener for the FAR register (used by the array, paginated and streamed paths).
  _assetRegisterInclude() {
    return [
      { model: AssetCategory, as: 'category', attributes: ['category_name'] },
      { model: Location, as: 'location', attributes: ['location_name'] },
      { model: Property, as: 'property', attributes: ['property_name'] },
      { model: Department, attributes: ['dept_name'] },
      { model: AssetAccounting, required: false },
      { model: AssetSubCategory, required: false, attributes: ['sub_category_name', 'schedule_ii_classification', 'useful_life', 'companies_act_life', 'companies_act_method'] }
    ];
  }
  _mapAssetRegisterRow(a) {
    const plain = a.get ? a.get({ plain: true }) : a;
    const cost = Number(plain.total_cost || plain.purchase_cost || 0);
    const accumulated = Number(plain.companies_act_accumulated ?? plain.AssetAccounting?.accumulated_dep_opening_balance ?? 0);
    const nbv = plain.companies_act_nbv != null ? Number(plain.companies_act_nbv) : Math.max(0, cost - accumulated);
    return {
      ...plain,
      category_name: plain.category?.category_name || '',
      location_name: plain.location?.location_name || '',
      property_name: plain.property?.property_name || '',
      department_name: plain.Department?.dept_name || '',
      sub_category: plain.AssetSubCategory?.sub_category_name || '',
      schedule_ii_classification: plain.schedule_ii_classification || plain.AssetSubCategory?.schedule_ii_classification || plain.category?.category_name || '',
      useful_life: plain.useful_life || plain.AssetSubCategory?.companies_act_life || plain.AssetSubCategory?.useful_life || 0,
      depreciation_method: plain.depreciation_method || plain.AssetAccounting?.method_of_depreciation || plain.AssetSubCategory?.companies_act_method || 'SLM',
      accumulated_dep_ca: accumulated,
      wdv_ca: nbv,
    };
  }

  // ARRAY return — used by the PDF export (bounded). Table + Excel export use the paged/streamed paths.
  async getAssetRegister(filters) {
    const where = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    const assets = await Asset.findAll({
      where,
      include: this._assetRegisterInclude(),
      order: [['created_at', 'DESC']],
      limit: 100000 // hard safety cap so the FAR report can never OOM the process
    });
    const seenIds = new Set();
    return assets.filter(a => { if (seenIds.has(a.id)) return false; seenIds.add(a.id); return true; }).map(a => this._mapAssetRegisterRow(a));
  }

  // PAGINATED return — used by the on-screen FAR table AND the streamed Excel export (page-by-page).
  async getAssetRegisterPage(filters) {
    const where = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    const pageSize = Math.min(Math.max(parseInt(filters.pageSize || filters.limit || 50, 10) || 50, 1), 5000);
    const page = Math.max(parseInt(filters.page || 1, 10) || 1, 1);
    const { rows, count } = await Asset.findAndCountAll({
      where,
      include: this._assetRegisterInclude(),
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true // count DISTINCT assets (the AssetAccounting join can otherwise inflate the count)
    });
    return { rows: rows.map(a => this._mapAssetRegisterRow(a)), count, page, pageSize };
  }

  // Resolve the latest fiscal year that has posted depreciation for this tenant (cheap single-row).
  async _latestDepreciationFy(assetWhere, baseWhere) {
    const row = await DepreciationLedger.findOne({
      where: baseWhere,
      attributes: ['fiscal_year'],
      include: [{ model: Asset, attributes: [], where: assetWhere, required: true }],
      order: [['fiscal_year', 'DESC']]
    });
    return row ? row.fiscal_year : null;
  }

  // Distinct fiscal years for the FY dropdown — does NOT load ledger rows.
  async getDepreciationFiscalYears(filters) {
    const assetWhere = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    const rows = await DepreciationLedger.findAll({
      attributes: [[fn('DISTINCT', col('DepreciationLedger.fiscal_year')), 'fiscal_year']],
      include: [{ model: Asset, attributes: [], where: assetWhere, required: true }],
      order: [[col('DepreciationLedger.fiscal_year'), 'DESC']],
      raw: true
    });
    return rows.map(r => r.fiscal_year).filter(Boolean);
  }

  // ARRAY return — used by the EXPORT path. Bounded: defaults to the latest FY when none is given,
  // and a hard limit so an export can never exhaust the process heap.
  async getDepreciationReport(filters) {
    const where = {};
    if (filters.book_type) where.book_type = filters.book_type;
    if (filters.period_month) where.period_month = Number(filters.period_month);
    const assetWhere = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    let fy = filters.fiscal_year || await this._latestDepreciationFy(assetWhere, where);
    if (fy) where.fiscal_year = fy;
    return await DepreciationLedger.findAll({
      where,
      include: [{ model: Asset, attributes: ['asset_name', 'asset_code', 'purchase_date', 'put_to_use_date'], where: assetWhere, required: true }],
      order: [['fiscal_year', 'DESC'], ['period_month', 'ASC']],
      limit: 100000 // hard safety cap — the whole point is to never build an unbounded response
    });
  }

  // PAGINATED return — used by the on-screen table. Never loads the whole ledger.
  async getDepreciationReportPage(filters) {
    const where = {};
    if (filters.book_type) where.book_type = filters.book_type;
    if (filters.period_month) where.period_month = Number(filters.period_month);
    const assetWhere = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    let fy = filters.fiscal_year || await this._latestDepreciationFy(assetWhere, where);
    if (fy) where.fiscal_year = fy;
    const pageSize = Math.min(Math.max(parseInt(filters.pageSize || filters.limit || 50, 10) || 50, 1), 500);
    const page = Math.max(parseInt(filters.page || 1, 10) || 1, 1);
    const { rows, count } = await DepreciationLedger.findAndCountAll({
      where,
      include: [{ model: Asset, attributes: ['asset_name', 'asset_code', 'purchase_date', 'put_to_use_date'], where: assetWhere, required: true }],
      order: [['fiscal_year', 'DESC'], ['period_month', 'ASC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });
    return { rows, count, fiscal_year: fy || null, page, pageSize };
  }

  async getMovementReport(filters) {
    const where = {};
    if (filters.from_date && filters.to_date) {
      where.movement_date = { [Op.between]: [filters.from_date, filters.to_date] };
    }
    const assetWhere = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    // A movement/history report must show movements regardless of the asset's CURRENT active
    // flag (e.g. an asset moved then later deactivated). Only tenant scoping should apply here.
    delete assetWhere.is_active;

    return await AssetMovement.findAll({
      where,
      include: [
        {
          model: Asset,
          attributes: ['asset_name', 'asset_code'],
          required: true,
          where: assetWhere
        },
        { model: Location, as: 'FromLocation', attributes: ['location_name'] },
        { model: Location, as: 'ToLocation', attributes: ['location_name'] }
      ],
      limit: 50000 // safety cap (movements are a small subset, but never let a report OOM the API)
    });
  }

  // PAGINATED return — used by the on-screen table (never loads the whole movement history).
  // Same shape as getMovementReport (nested Asset/From/To associations); array method kept for export.
  async getMovementReportPage(filters) {
    const where = {};
    if (filters.from_date && filters.to_date) {
      where.movement_date = { [Op.between]: [filters.from_date, filters.to_date] };
    }
    const assetWhere = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    delete assetWhere.is_active; // a movement of a since-deactivated asset must still appear
    const pageSize = Math.min(Math.max(parseInt(filters.pageSize || filters.limit || 50, 10) || 50, 1), 500);
    const page = Math.max(parseInt(filters.page || 1, 10) || 1, 1);
    const { rows, count } = await AssetMovement.findAndCountAll({
      where,
      include: [
        { model: Asset, attributes: ['asset_name', 'asset_code'], required: true, where: assetWhere },
        { model: Location, as: 'FromLocation', attributes: ['location_name'] },
        { model: Location, as: 'ToLocation', attributes: ['location_name'] }
      ],
      order: [['movement_date', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true // count DISTINCT movements (the Asset inner-join must not inflate the count)
    });
    return { rows, count, page, pageSize };
  }

  async getDisposalReport(filters) {
    const where = {};
    if (filters.from_date && filters.to_date) {
      where.disposal_date = { [Op.between]: [filters.from_date, filters.to_date] };
    }
    const assetWhere = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    // A disposal report is ABOUT disposed (inactive) assets — never exclude them via is_active.
    delete assetWhere.is_active;

    return await AssetDisposal.findAll({
      where,
      include: [
        {
          model: Asset,
          attributes: ['asset_name', 'asset_code'],
          where: assetWhere
        }
      ],
      limit: 50000 // safety cap
    });
  }

  // PAGINATED return — used by the on-screen table. Array method kept for export.
  async getDisposalReportPage(filters) {
    const where = {};
    if (filters.from_date && filters.to_date) {
      where.disposal_date = { [Op.between]: [filters.from_date, filters.to_date] };
    }
    const assetWhere = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    delete assetWhere.is_active; // a disposal report is ABOUT disposed (inactive) assets
    const pageSize = Math.min(Math.max(parseInt(filters.pageSize || filters.limit || 50, 10) || 50, 1), 500);
    const page = Math.max(parseInt(filters.page || 1, 10) || 1, 1);
    const { rows, count } = await AssetDisposal.findAndCountAll({
      where,
      include: [
        { model: Asset, attributes: ['asset_name', 'asset_code'], where: assetWhere }
      ],
      order: [['disposal_date', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true
    });
    return { rows, count, page, pageSize };
  }

  async getAuditSummary(filters) {
    const where = { ...this.buildTenantWhere(filters) };
    if (filters.property_id) where.property_id = filters.property_id;

    const sessions = await AuditSession.findAll({
      where,
      include: [
        { model: Property, attributes: ['property_name'], required: false },
        { model: Location, attributes: ['location_name'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit: 50000 // safety cap
    });

    return sessions.map(s => {
      const plain = s.get({ plain: true });
      return {
        ...plain,
        property_name: plain.Property?.property_name || '',
        location_name: plain.Location?.location_name || ''
      };
    });
  }

  // PAGINATED return — used by the on-screen table. Same flattened shape as getAuditSummary.
  async getAuditSummaryPage(filters) {
    const where = { ...this.buildTenantWhere(filters) };
    if (filters.property_id) where.property_id = filters.property_id;
    const pageSize = Math.min(Math.max(parseInt(filters.pageSize || filters.limit || 50, 10) || 50, 1), 500);
    const page = Math.max(parseInt(filters.page || 1, 10) || 1, 1);
    const { rows, count } = await AuditSession.findAndCountAll({
      where,
      include: [
        { model: Property, attributes: ['property_name'], required: false },
        { model: Location, attributes: ['location_name'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true
    });
    const data = rows.map(s => {
      const plain = s.get({ plain: true });
      return {
        ...plain,
        property_name: plain.Property?.property_name || '',
        location_name: plain.Location?.location_name || ''
      };
    });
    return { rows: data, count, page, pageSize };
  }

  // CR-DEP-P2a: IT-Act depreciation now comes from the block ledger + per-asset allocation
  // (Section 32), not the retired monthly it_act_* columns. Rows are empty until the annual
  // "Run IT Act (FY)" has been executed for the tenant.
  async getITDepreciationReport(filters) {
    const tenantWhere = this.buildTenantWhere(filters); // { client_id } or {} for provider-admin
    const where = { ...tenantWhere };
    if (filters.fy) where.fiscal_year = filters.fy;

    const allocs = await ItActBlockAssetAlloc.findAll({
      where,
      include: [{ model: ItActBlockLedger, as: 'block', attributes: ['it_act_block', 'it_act_rate', 'fiscal_year'] }],
      order: [['fiscal_year', 'DESC']],
      limit: 100000 // safety cap
    });
    if (!allocs.length) return [];

    // batch-fetch asset names/codes (avoid adding a model association)
    const assetIds = [...new Set(allocs.map(a => a.asset_id))];
    const assets = await Asset.findAll({
      where: { id: assetIds },
      include: [{ model: AssetCategory, as: 'category', attributes: ['category_name'] }],
      limit: 100000 // safety cap (bounded by capped allocs above)
    });
    const aById = Object.fromEntries(assets.map(a => [a.id, a]));

    return allocs.map(a => {
      const asset = aById[a.asset_id] || {};
      return {
        category: asset.category?.category_name || null,
        name: asset.asset_name || null,
        asset_code: asset.asset_code || null,
        block: a.block?.it_act_block || 'General',
        rate: `${Number(a.block?.it_act_rate || 0)}%`,
        fy: a.fiscal_year,
        opening_wdv: Number(a.opening_wdv || 0).toFixed(2),
        additions: Number(a.addition || 0).toFixed(2),
        deletions: '0.00',
        depreciation: Number(a.allocated_depreciation || 0).toFixed(2),
        closing_wdv: Number(a.closing_wdv || 0).toFixed(2)
      };
    });
  }

  async getCompaniesDepreciationReport(filters) {
    const where = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    const assets = await Asset.findAll({
      where,
      include: [
        { model: AssetCategory, as: 'category', attributes: ['category_name'] }
      ],
      order: [['asset_code', 'ASC']],
      limit: 100000 // safety cap
    });

    return assets.map(item => ({
      code: item.asset_code,
      name: item.asset_name,
      category: item.category?.category_name,
      cost: parseFloat(item.total_cost || 0).toFixed(2),
      residual: parseFloat(item.residual_value || 0).toFixed(2),
      life: item.useful_life || 'N/A',
      method: item.depreciation_method || 'SLM',
      accumulated: parseFloat(item.companies_act_accumulated || 0).toFixed(2),
      nbv: parseFloat(item.companies_act_nbv || 0).toFixed(2)
    }));
  }

  async getDisposalSummary(filters) {
    const where = { 
      is_disposed: true, 
      ...this.buildTenantWhere(filters) 
    };
    if (filters.property_id) where.property_id = filters.property_id;
    if (filters.category_id) where.category_id = filters.category_id;
    if (filters.from_date && filters.to_date) {
      where.disposal_date = { [Op.between]: [filters.from_date, filters.to_date] };
    }

    return await Asset.findAll({
      where,
      include: [
        { model: AssetCategory, as: 'category', attributes: ['category_name'] }
      ],
      order: [['disposal_date', 'DESC']],
      limit: 100000 // safety cap
    });
  }

  async getCompaniesActDepreciationSchedule(filters) {
    const where = this.buildDepreciationAssetWhere(filters);
    const assets = await Asset.findAll({
      where,
      include: [
        { model: AssetCategory, as: 'category', attributes: ['category_name'] },
        { model: Department, attributes: ['dept_name'] },
        { model: Location, as: 'location', attributes: ['location_name'] }
      ],
      order: [['asset_code', 'ASC']],
      limit: 100000 // safety cap
    });

    const fy = filters.fy || assets[0]?.it_act_fy || null;
    return assets.map((a) => ({
      asset_code: a.asset_code,
      asset_name: a.asset_name,
      asset_category: a.category?.category_name || '',
      purchase_date: a.purchase_date,
      original_cost: Number(a.total_cost || a.purchase_cost || 0),
      residual_value_5: Number(a.co_act_residual_value || a.residual_value || 0),
      useful_life: Number(a.useful_life_years || a.useful_life || 0),
      depreciation_method: a.co_act_depreciation_method || a.depreciation_method || 'SLM',
      annual_dep_ca: Number(a.companies_act_depreciation || 0),
      annual_dep_ca_slm: Number(a.co_act_dep_slm_annual || a.companies_act_depreciation || 0),
      annual_dep_ca_wdv: Number(a.co_act_dep_wdv_annual || 0),
      accumulated_dep_ca: Number(a.co_act_accumulated_dep || a.companies_act_accumulated || 0),
      wdv_as_on_date: Number(a.co_act_wdv_remaining || a.companies_act_nbv || 0),
      fy
    }));
  }

  async getITActDepreciationSchedule(filters) {
    const where = this.buildDepreciationAssetWhere(filters, { filterFy: true });
    const assets = await Asset.findAll({
      where,
      include: [
        { model: AssetCategory, as: 'category', attributes: ['category_name'] }
      ],
      order: [['asset_code', 'ASC']],
      limit: 100000 // safety cap
    });

    return assets.map((a) => ({
      asset_block: a.it_act_block_id || a.category?.category_name || 'General',
      asset_code: a.asset_code,
      asset_name: a.asset_name,
      purchase_date: a.purchase_date,
      original_cost: Number(a.total_cost || a.purchase_cost || 0),
      opening_wdv: Number((a.it_act_wdv_remaining || a.it_act_wdv || 0) + (a.it_act_dep_annual || a.it_act_depreciation || 0)),
      it_act_rate: Number(a.it_act_dep_wdv_rate || 0),
      annual_dep_it: Number(a.it_act_dep_annual || a.it_act_depreciation || 0),
      closing_wdv: Number(a.it_act_wdv_remaining || a.it_act_wdv || 0),
      half_year_rule_applied: Boolean(a.it_act_half_year_rule),
      fy: a.it_act_fy || filters.fy || null
    }));
  }

  async getComparativeDepreciationSchedule(filters) {
    const companies = await this.getCompaniesActDepreciationSchedule(filters);
    const it = await this.getITActDepreciationSchedule(filters);
    const itByCode = new Map(it.map((row) => [row.asset_code, row]));

    return companies.map((c) => {
      const itRow = itByCode.get(c.asset_code);
      const annualIT = Number(itRow?.annual_dep_it || 0);
      return {
        asset_code: c.asset_code,
        asset_name: c.asset_name,
        fy: c.fy || itRow?.fy || null,
        annual_dep_ca_slm: Number(c.annual_dep_ca_slm || 0),
        annual_dep_ca_wdv: Number(c.annual_dep_ca_wdv || 0),
        annual_dep_it_act: annualIT,
        difference_ca_slm_vs_it: Number(c.annual_dep_ca_slm || 0) - annualIT,
        difference_ca_wdv_vs_it: Number(c.annual_dep_ca_wdv || 0) - annualIT
      };
    });
  }

  async getAuditorBundle(filters) {
    const assetWhere = { ...this.buildAssetWhere(filters), ...this.buildTenantWhere(filters) };
    if (filters.asset_code_from || filters.asset_code_to) {
      assetWhere.asset_code = {};
      if (filters.asset_code_from) assetWhere.asset_code[Op.gte] = filters.asset_code_from;
      if (filters.asset_code_to) assetWhere.asset_code[Op.lte] = filters.asset_code_to;
    }

    const assets = await Asset.findAll({
      where: assetWhere,
      include: [
        { model: AssetCategory, as: 'category', attributes: ['category_name'] },
        { model: Location, as: 'location', attributes: ['location_name'] },
        { model: Property, as: 'property', attributes: ['property_name'] },
        { model: Department, attributes: ['dept_name'] },
        // FIX: include AssetSubCategory so Schedule II fields are available for FAR/CARO export
        { model: AssetSubCategory, required: false, attributes: ['sub_category_name', 'schedule_ii_classification', 'useful_life', 'companies_act_life', 'companies_act_method', 'it_act_rate'] }
      ],
      order: [['asset_code', 'ASC']],
      limit: 100000 // safety cap
    });

    const assetIds = assets.map((asset) => asset.id);
    const latestVerification = assetIds.length
      ? await AssetAuditLog.findAll({
          where: { asset_id: assetIds },
          order: [['createdAt', 'DESC']],
          limit: 200000 // safety cap (bounded by assetIds above)
        }).catch(() => [])
      : [];
    const verificationByAsset = new Map();
    latestVerification.forEach((row) => {
      if (!verificationByAsset.has(row.asset_id)) verificationByAsset.set(row.asset_id, row);
    });

    const caroRegister = assets.map((asset) => {
      const verification = verificationByAsset.get(asset.id);
      // Schedule II classification — prefer asset-level stored value, then derive from subcategory
      const scheduleIIClass =
        asset.schedule_ii_classification ||
        asset.AssetSubCategory?.schedule_ii_classification ||
        (asset.category?.category_name
          ? `${asset.category.category_name}${asset.AssetSubCategory?.sub_category_name ? ' — ' + asset.AssetSubCategory.sub_category_name : ''}`
          : '');
      return {
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        schedule_ii_classification: scheduleIIClass, // Required for CARO 2020 Clause 3(i)
        asset_type: asset.asset_type || '',
        asset_status: asset.asset_status || (asset.is_active ? 'ACTIVE' : 'INACTIVE'),
        asset_description: asset.asset_description || '',
        category: asset.category?.category_name || '',
        sub_category: asset.AssetSubCategory?.sub_category_name || '',
        property: asset.property?.property_name || asset.property_name || '',
        location: asset.location?.location_name || asset.location_name || '',
        department: asset.Department?.dept_name || '',
        custodian: [asset.first_name, asset.last_name].filter(Boolean).join(' '),
        acquisition_date: asset.purchase_date,
        put_to_use_date: asset.put_to_use_date,
        original_cost: Number(asset.total_cost || asset.purchase_cost || 0),
        depreciation_method: asset.depreciation_method || asset.AssetSubCategory?.companies_act_method || 'SLM',
        useful_life: Number(asset.useful_life_years || asset.useful_life || asset.AssetSubCategory?.companies_act_life || asset.AssetSubCategory?.useful_life || 0),
        residual_value: Number(asset.co_act_residual_value || asset.residual_value || 0),
        annual_dep_ca: Number(asset.co_act_dep_slm_annual || asset.companies_act_depreciation || 0),
        accumulated_dep_ca: Number(asset.co_act_accumulated_dep || asset.companies_act_accumulated || 0),
        wdv_ca: Number(asset.co_act_wdv_remaining || asset.companies_act_nbv || 0),
        tag_status: asset.tag_code ? 'TAGGED' : 'UNTAGGED',
        verification_status: asset.verification_status || verification?.status || 'UNVERIFIED',
        last_verified_date: asset.last_verified_date || verification?.created_at || null,
        disposal_status: asset.is_disposed ? 'DISPOSED' : 'ACTIVE'
      };
    });

    const companiesAct = await this.getCompaniesActDepreciationSchedule(filters);
    const itAct = await this.getITActDepreciationSchedule(filters);
    const comparative = await this.getComparativeDepreciationSchedule(filters);
    const disposalSummary = await this.getDisposalSummary(filters);
    const auditSummary = await this.getAuditSummary(filters);

    const exceptions = [];
    caroRegister.forEach((row) => {
      if (!row.asset_description || row.asset_description.length < 10) {
        exceptions.push({ asset_code: row.asset_code, exception: 'Asset description missing or too short', severity: 'HIGH' });
      }
      if (!row.location) {
        exceptions.push({ asset_code: row.asset_code, exception: 'Location missing', severity: 'HIGH' });
      }
      if (row.original_cost <= 0) {
        exceptions.push({ asset_code: row.asset_code, exception: 'Original cost missing or zero', severity: 'HIGH' });
      }
      if (row.original_cost > 0 && row.residual_value > row.original_cost * 0.05 + 0.01) {
        exceptions.push({ asset_code: row.asset_code, exception: 'Residual value exceeds 5% cap', severity: 'HIGH' });
      }
      if (row.verification_status === 'UNVERIFIED') {
        exceptions.push({ asset_code: row.asset_code, exception: 'Physical verification pending', severity: 'MEDIUM' });
      }
      if (row.tag_status === 'UNTAGGED') {
        exceptions.push({ asset_code: row.asset_code, exception: 'QR/tag not generated', severity: 'MEDIUM' });
      }
    });

    const activityWhere = { ...this.buildTenantWhere(filters) };
    const auditTrail = await ActivityLog.findAll({
      where: activityWhere,
      order: [['createdAt', 'DESC']],
      limit: 500
    }).catch(() => []);

    return {
      meta: {
        title: 'Auditor Compliance Bundle',
        fy: filters.fy || filters.financial_year || null,
        generated_at: new Date().toISOString(),
        filters: {
          property_id: filters.property_id || null,
          category_id: filters.category_id || null,
          department_id: filters.department_id || null,
          location_id: filters.location_id || null,
          asset_code_from: filters.asset_code_from || null,
          asset_code_to: filters.asset_code_to || null
        },
        counts: {
          assets: caroRegister.length,
          exceptions: exceptions.length,
          audit_trail_rows: auditTrail.length
        }
      },
      caro_register: caroRegister,
      companies_act_depreciation: companiesAct,
      it_act_depreciation: itAct,
      comparative_depreciation: comparative,
      physical_verification: caroRegister.map((row) => ({
        asset_code: row.asset_code,
        asset_name: row.asset_name,
        location: row.location,
        custodian: row.custodian,
        tag_status: row.tag_status,
        verification_status: row.verification_status,
        last_verified_date: row.last_verified_date
      })),
      disposal_summary: disposalSummary.map((asset) => ({
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        category: asset.category?.category_name || '',
        disposal_date: asset.disposal_date,
        disposal_value: Number(asset.disposal_value || 0),
        profit_loss: Number(asset.profit_loss || 0),
        disposal_type: asset.disposal_type || ''
      })),
      audit_sessions: auditSummary.map((session) => ({
        id: session.id,
        audit_name: session.audit_name || session.session_name,
        status: session.status,
        property_id: session.property_id,
        location_id: session.location_id,
        start_date: session.start_date,
        end_date: session.end_date
      })),
      exception_report: exceptions,
      audit_trail: auditTrail.map((log) => ({
        id: log.id,
        created_at: log.createdAt,
        user_id: log.user_id,
        actor_role: log.actor_role,
        module: log.module,
        action: log.action,
        record_id: log.record_id,
        description: log.description,
        entry_hash: log.entry_hash,
        previous_hash: log.previous_hash
      }))
    };
  }

  async getStockVerificationReport(filters) {
    const Loc = Location;
    const where = { ...this.buildTenantWhere(filters) }; // B1: tenant scope (was leaking all tenants)
    if (filters.location_id) where.location_id = filters.location_id;
    if (filters.status) where.status = filters.status;
    if (filters.from_date || filters.to_date) {
      where.createdAt = {};
      if (filters.from_date) where.createdAt[Op.gte] = new Date(filters.from_date);
      if (filters.to_date)   where.createdAt[Op.lte] = new Date(filters.to_date + 'T23:59:59');
    }
    const sessions = await VerificationSession.findAll({
      where,
      include: [
        { model: Loc, attributes: ['location_name'] },
        { model: User, as: 'Auditor', attributes: ['first_name', 'last_name'] },
        { model: VerificationDetail, include: [{ model: Item, attributes: ['item_name', 'sku_code'] }] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 50000 // safety cap
    });
    return sessions.map(s => {
      const details = s.VerificationDetails || [];
      const totalItems = details.length;
      const variantItems = details.filter(d => (d.physical_qty || 0) !== (d.system_qty || 0)).length;
      const shortages = details.filter(d => (d.physical_qty || 0) < (d.system_qty || 0)).length;
      const surpluses = details.filter(d => (d.physical_qty || 0) > (d.system_qty || 0)).length;
      return {
        id: s.id,
        session_name: s.session_name,
        location_name: s.Location?.location_name || '-',
        auditor_name: s.Auditor ? s.Auditor.first_name + ' ' + s.Auditor.last_name : '-',
        status: s.status,
        total_items: totalItems,
        matched_items: totalItems - variantItems,
        variant_items: variantItems,
        shortages,
        surpluses,
        createdAt: s.createdAt
      };
    });
  }

  // PAGINATED return — used by the on-screen table. Same flattened summary shape as the array method.
  async getStockVerificationReportPage(filters) {
    const Loc = Location;
    const where = { ...this.buildTenantWhere(filters) }; // B1: tenant scope
    if (filters.location_id) where.location_id = filters.location_id;
    if (filters.status) where.status = filters.status;
    if (filters.from_date || filters.to_date) {
      where.createdAt = {};
      if (filters.from_date) where.createdAt[Op.gte] = new Date(filters.from_date);
      if (filters.to_date)   where.createdAt[Op.lte] = new Date(filters.to_date + 'T23:59:59');
    }
    const pageSize = Math.min(Math.max(parseInt(filters.pageSize || filters.limit || 50, 10) || 50, 1), 500);
    const page = Math.max(parseInt(filters.page || 1, 10) || 1, 1);
    const { rows, count } = await VerificationSession.findAndCountAll({
      where,
      include: [
        { model: Loc, attributes: ['location_name'] },
        { model: User, as: 'Auditor', attributes: ['first_name', 'last_name'] },
        { model: VerificationDetail, include: [{ model: Item, attributes: ['item_name', 'sku_code'] }] }
      ],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true // count DISTINCT sessions (the VerificationDetail hasMany join inflates otherwise)
    });
    const data = rows.map(s => {
      const details = s.VerificationDetails || [];
      const totalItems = details.length;
      const variantItems = details.filter(d => (d.physical_qty || 0) !== (d.system_qty || 0)).length;
      const shortages = details.filter(d => (d.physical_qty || 0) < (d.system_qty || 0)).length;
      const surpluses = details.filter(d => (d.physical_qty || 0) > (d.system_qty || 0)).length;
      return {
        id: s.id,
        session_name: s.session_name,
        location_name: s.Location?.location_name || '-',
        auditor_name: s.Auditor ? s.Auditor.first_name + ' ' + s.Auditor.last_name : '-',
        status: s.status,
        total_items: totalItems,
        matched_items: totalItems - variantItems,
        variant_items: variantItems,
        shortages,
        surpluses,
        createdAt: s.createdAt
      };
    });
    return { rows: data, count, page, pageSize };
  }

  buildAssetWhere(filters) {
    const where = { is_active: true };
    if (filters.property_id) where.property_id = filters.property_id;
    if (filters.department_id) where.department_id = filters.department_id;
    if (filters.location_id) where.location_id = filters.location_id;
    if (filters.category_id) where.category_id = filters.category_id;
    if (filters.status) where.status = filters.status;
    return where;
  }

  buildTenantWhere(filters) {
    return buildAdminWhere({ user: filters.user });
  }
}

module.exports = new ReportService();
