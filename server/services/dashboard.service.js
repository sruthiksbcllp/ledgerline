'use strict';
const {
  Asset,
  AuditResult,
  AssetScanLog,
  AssetDisposal,
  AssetAmc,
  Client,
  ClientLicense,
  SupportTicket,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { isDevAdminRole } = require('../utils/devRole');

class DashboardService {

  /**
   * Resolve the effective client_id for dashboard queries.
   * PROVIDER_ADMIN: uses query param if provided, otherwise null (all clients).
   * Other roles: always scoped to req.user.client_id.
   */
  _resolveClientFilter(req) {
    const user = req.user;
    const role = user.role || (user.Role && user.Role.code);
    const isPA = role === 'PROVIDER_ADMIN' || isDevAdminRole(role);

    let effectiveClientId = null;
    if (isPA) {
      const fromQuery = req.query?.client_id;
      if (fromQuery) effectiveClientId = parseInt(fromQuery, 10);
    } else {
      effectiveClientId = user.client_id || null;
    }

    const cf = effectiveClientId ? `AND client_id = ${effectiveClientId}` : '';
    const adminWhere = effectiveClientId ? { client_id: effectiveClientId } : {};

    return { cf, effectiveClientId, isProviderAdmin: isPA, adminWhere };
  }

  async getSummary(req) {
    const { cf, effectiveClientId, isProviderAdmin, adminWhere } = this._resolveClientFilter(req);

    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(now.getDate() - 180);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 19).replace('T', ' ');

    const stats = await sequelize.query(
      `SELECT COUNT(*) as totalAssets,
              SUM(COALESCE(total_cost,0)) as totalAssetValue,
              SUM(COALESCE(companies_act_accumulated,companies_act_depreciation,0)) as totalCoDep,
              SUM(COALESCE(it_act_accumulated,it_act_depreciation,0)) as totalItDep,
              SUM(COALESCE(total_cost,0) - COALESCE(companies_act_accumulated,companies_act_depreciation,0)) as totalCoNbv,
              SUM(COALESCE(total_cost,0) - COALESCE(it_act_accumulated,it_act_depreciation,0)) as totalItWdv
       FROM assets WHERE COALESCE(is_disposed,0)=0 AND COALESCE(is_budgetary,0)=0 AND COALESCE(is_active,1)=1 ${cf}`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const totalAssets     = parseInt(stats[0].totalAssets)       || 0;
    const totalAssetValue = parseFloat(stats[0].totalAssetValue) || 0;
    const totalCoDep      = parseFloat(stats[0].totalCoDep)      || 0;
    const totalItDep      = parseFloat(stats[0].totalItDep)      || 0;
    const totalCoNbv      = Math.max(0, parseFloat(stats[0].totalCoNbv) || 0);
    const totalItWdv      = Math.max(0, parseFloat(stats[0].totalItWdv) || 0);

    // IT-Act depreciation lives in the block-of-assets ledger (annual), NOT in per-asset snapshot columns.
    // Current tax WDV = latest fiscal year's closing WDV per (client, block); accumulated = gross - WDV.
    // Falls back to the per-asset figures when a tenant has no block ledger (backward compatible).
    let finalItWdv = totalItWdv, finalItDep = totalItDep;
    try {
      const itLedger = await sequelize.query(
        `SELECT SUM(l.closing_wdv) as itWdv, COUNT(*) as rws
         FROM it_act_block_ledger l
         JOIN (SELECT client_id, it_act_block, MAX(fiscal_year) mfy
               FROM it_act_block_ledger WHERE 1=1 ${cf} GROUP BY client_id, it_act_block) latest
           ON latest.client_id=l.client_id AND latest.it_act_block=l.it_act_block AND latest.mfy=l.fiscal_year`,
        { type: sequelize.QueryTypes.SELECT }
      );
      if (itLedger[0] && parseInt(itLedger[0].rws) > 0) {
        const wdv = Math.max(0, parseFloat(itLedger[0].itWdv) || 0);
        finalItWdv = wdv;
        finalItDep = Math.max(0, totalAssetValue - wdv);
      }
    } catch (e) { /* block ledger absent -> keep per-asset fallback */ }

    const vs = await sequelize.query(
      `SELECT COUNT(*) as n FROM assets WHERE COALESCE(is_disposed,0)=0 AND COALESCE(is_budgetary,0)=0 AND COALESCE(is_active,1)=1 AND verification_status IN ('VERIFIED','FOUND') ${cf}`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const verifiedAssets = parseInt(vs[0].n) || 0;

    const ms = await sequelize.query(
      `SELECT COUNT(*) as n, SUM(COALESCE(total_cost,0)) as val
       FROM assets WHERE COALESCE(is_budgetary,0)=0 AND COALESCE(is_active,1)=1 AND (verification_status='MISSING' OR asset_status='MISSING') ${cf}`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const missingAssets     = parseInt(ms[0].n)    || 0;
    const missingAssetValue = parseFloat(ms[0].val) || 0;

    const inactiveResult = await sequelize.query(
      `SELECT COUNT(*) as n, SUM(COALESCE(total_cost,0)) as val
       FROM assets a
       WHERE COALESCE(a.is_disposed,0)=0
         AND COALESCE(a.is_budgetary,0)=0
         AND COALESCE(a.is_active,1)=1
         AND (a.asset_status='INACTIVE' OR NOT EXISTS (
           SELECT 1 FROM asset_scan_logs sl
           WHERE sl.asset_id=a.id AND sl.scanned_at>='${sixMonthsAgoStr}'
         )) ${cf}`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const inactiveAssets     = parseInt(inactiveResult[0].n)    || 0;
    const inactiveAssetValue = parseFloat(inactiveResult[0].val) || 0;

    const verifiedPercentage  = totalAssets > 0 ? (verifiedAssets / totalAssets) * 100 : 0;
    const noMissingPercentage = totalAssets > 0 ? ((totalAssets - missingAssets) / totalAssets) * 100 : 0;
    const auditReadinessScore = totalAssets > 0 ? (verifiedPercentage * 0.7) + (noMissingPercentage * 0.3) : 0;

    return {
      totalAssets,
      verifiedAssets,
      verifiedPercentage:  parseFloat(verifiedPercentage.toFixed(2)),
      missingAssets,
      inactiveAssets,
      inactiveAssetValue:  parseFloat(inactiveAssetValue.toFixed(2)),
      auditReadinessScore: parseFloat(auditReadinessScore.toFixed(2)),
      totalAssetValue:     parseFloat(totalAssetValue.toFixed(2)),
      missingAssetValue:   parseFloat(missingAssetValue.toFixed(2)),
      active_assets: totalAssets - missingAssets,
      companies_act: { total_depreciation: totalCoDep, nbv: totalCoNbv },
      it_act:        { total_depreciation: finalItDep, wdv: finalItWdv },

      disposed_count: await Asset.count({ where: { is_disposed: { [Op.eq]: true }, is_budgetary: { [Op.not]: true }, ...adminWhere } }),
      total_gain_loss: (await Asset.sum('profit_loss', { where: { is_disposed: { [Op.eq]: true }, is_budgetary: { [Op.not]: true }, ...adminWhere } })) || 0,

      amc_expiring_soon: await AssetAmc.count({
        where: {
          status: 'ACTIVE', ...adminWhere,
          end_date: { [Op.between]: [new Date(), new Date(Date.now() + 30*86400000)] }
        }
      }),
      amc_overdue_services: await AssetAmc.count({
        where: { ...adminWhere, next_service_date: { [Op.lte]: new Date() } }
      }),

      cwip_balance: await this._getCwipBalance(cf),
      capex_this_quarter: await this._getCapexThisQuarter(cf),
      warranty_expiring: await this._getWarrantyExpiring(cf),
      maintenance_overdue: await this._getMaintenanceOverdue(adminWhere),

      total_clients:   isProviderAdmin ? await Client.count() : 1,
      active_licenses: isProviderAdmin ? await ClientLicense.count({ where: { status: 'ACTIVE' } }) : 1,
      pending_support_tickets: await SupportTicket.count({
        where: { status: { [Op.ne]: 'CLOSED' }, ...adminWhere }
      }),

      categoryDistribution: await this.getCategoryDistribution(req)
    };
  }

  async _getCwipBalance(cf) {
    try {
      const [row] = await sequelize.query(
        `SELECT COALESCE(SUM(total_cost), 0) as balance, COUNT(*) as count
         FROM cwip_projects WHERE status NOT IN ('CAPITALIZED','CANCELLED') ${cf}`,
        { type: sequelize.QueryTypes.SELECT }
      );
      return { balance: parseFloat(row.balance) || 0, count: parseInt(row.count) || 0 };
    } catch (e) { return { balance: 0, count: 0 }; }
  }

  async _getCapexThisQuarter(cf) {
    try {
      const now = new Date();
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const qStart = new Date(now.getFullYear(), qMonth, 1).toISOString().slice(0, 10);
      const [row] = await sequelize.query(
        `SELECT COALESCE(SUM(total_cost), 0) as amount, COUNT(*) as count
         FROM assets WHERE purchase_date >= '${qStart}' AND COALESCE(is_budgetary, 0) = 0 AND COALESCE(is_active,1)=1 ${cf}`,
        { type: sequelize.QueryTypes.SELECT }
      );
      return { amount: parseFloat(row.amount) || 0, count: parseInt(row.count) || 0 };
    } catch (e) { return { amount: 0, count: 0 }; }
  }

  async _getWarrantyExpiring(cf) {
    try {
      const [row] = await sequelize.query(
        `SELECT COUNT(*) as count FROM assets
         WHERE warranty_expiry_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)
         AND COALESCE(is_disposed, 0) = 0 ${cf}`,
        { type: sequelize.QueryTypes.SELECT }
      );
      return parseInt(row.count) || 0;
    } catch (e) { return 0; }
  }

  async _getMaintenanceOverdue(adminWhere) {
    try {
      const { AssetMaintenance } = require('../models');
      const includeOpts = [];
      if (adminWhere.client_id) {
        includeOpts.push({ model: Asset, attributes: [], where: { client_id: adminWhere.client_id }, required: true });
      }
      return await AssetMaintenance.count({
        where: { status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] }, scheduled_date: { [Op.lt]: new Date() } },
        include: includeOpts
      });
    } catch (e) { return 0; }
  }

  async getCategoryDistribution(req) {
    const { AssetCategory } = require('../models');
    const { adminWhere } = this._resolveClientFilter(req);
    const distribution = await Asset.findAll({
      where: { is_disposed: { [Op.ne]: true }, is_budgetary: { [Op.not]: true }, ...adminWhere },
      attributes: [[sequelize.fn('COUNT', sequelize.col('Asset.id')), 'count']],
      include: [{ model: AssetCategory, as: 'category', attributes: ['category_name'] }],
      group: ['category_id', 'category.id'],
      raw: true,
      nest: true
    });
    return distribution;
  }

  async getAlerts(req) {
    const { cf, isProviderAdmin, adminWhere } = this._resolveClientFilter(req);
    const alerts = [];

    const expiringAmcs = await AssetAmc.count({
      where: { status: 'ACTIVE', ...adminWhere,
        end_date: { [Op.between]: [new Date(), new Date(Date.now() + 30*86400000)] } }
    });
    if (expiringAmcs > 0) alerts.push({ type: 'AMC_EXPIRY', count: expiringAmcs, severity: 'HIGH',
      message: `${expiringAmcs} AMCs expiring in next 30 days`, action: 'Renew Contracts' });

    const overdueServices = await AssetAmc.count({
      where: { ...adminWhere, next_service_date: { [Op.lte]: new Date() } }
    });
    if (overdueServices > 0) alerts.push({ type: 'SERVICE_DUE', count: overdueServices, severity: 'MEDIUM',
      message: `${overdueServices} assets have maintenance service due`, action: 'Schedule Service' });

    const dupRows = await sequelize.query(
      `SELECT serial_number, COUNT(*) as cnt FROM assets
       WHERE serial_number IS NOT NULL AND serial_number!='' ${cf}
       GROUP BY serial_number HAVING COUNT(*)>1`,
      { type: sequelize.QueryTypes.SELECT }
    );
    if (dupRows.length > 0) alerts.push({ type: 'DUPLICATE_ASSETS', count: dupRows.length, severity: 'HIGH',
      message: `${dupRows.length} duplicate serial numbers detected`, action: 'Cleanse Data' });

    const sixMonthsAgo = new Date(Date.now() - 180*86400000).toISOString().slice(0,19).replace('T',' ');
    const inactiveRows = await sequelize.query(
      `SELECT COUNT(*) as n FROM assets a
       WHERE COALESCE(a.is_disposed,0)=0
         AND NOT EXISTS (SELECT 1 FROM asset_scan_logs sl WHERE sl.asset_id=a.id AND sl.scanned_at>='${sixMonthsAgo}') ${cf}`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const inactiveCount = parseInt(inactiveRows[0].n ?? inactiveRows[0].count ?? 0) || 0;
    if (inactiveCount > 0) alerts.push({ type: 'INACTIVE_ASSETS', count: inactiveCount, severity: 'MEDIUM',
      message: `${inactiveCount} assets inactive > 180 days`, action: 'Review Utilization' });

    const severityMap = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return alerts
      .sort((a, b) => (severityMap[b.severity] || 0) - (severityMap[a.severity] || 0))
      .slice(0, 5);
  }

  async getMonthOverMonth(req) {
    const { cf } = this._resolveClientFilter(req);
    const cfIssues = cf;

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoStr = oneMonthAgo.toISOString().slice(0, 19).replace('T', ' ');

    const calcChange = (curr, prev) => {
      const c = Number(curr) || 0;
      const p = Number(prev) || 0;
      if (p === 0) return c > 0 ? 100 : 0;
      return parseFloat(((c - p) / p * 100).toFixed(1));
    };

    const [currAssets] = await sequelize.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN verification_status IN ('VERIFIED','FOUND') THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN verification_status='UNVERIFIED' OR asset_status='MISSING' THEN 1 ELSE 0 END) as pending
       FROM assets WHERE COALESCE(is_disposed,0)=0 AND COALESCE(is_budgetary,0)=0 AND COALESCE(is_active,1)=1 ${cf}`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const [prevAssets] = await sequelize.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN verification_status IN ('VERIFIED','FOUND') THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN verification_status='UNVERIFIED' OR asset_status='MISSING' THEN 1 ELSE 0 END) as pending
       FROM assets WHERE COALESCE(is_disposed,0)=0 AND COALESCE(is_budgetary,0)=0 AND COALESCE(is_active,1)=1
         AND created_at <= '${oneMonthAgoStr}' ${cf}`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const [critNow] = await sequelize.query(
      `SELECT COUNT(*) as n FROM assetissues WHERE priority='HIGH' AND status NOT IN ('RESOLVED','CLOSED') ${cfIssues}`,
      { type: sequelize.QueryTypes.SELECT }
    ).catch(() => [{ n: 0 }]);

    const [critPrev] = await sequelize.query(
      `SELECT COUNT(*) as n FROM assetissues WHERE priority='HIGH' AND status NOT IN ('RESOLVED','CLOSED')
         AND createdAt <= '${oneMonthAgoStr}' ${cfIssues}`,
      { type: sequelize.QueryTypes.SELECT }
    ).catch(() => [{ n: 0 }]);

    const totalChange    = calcChange(currAssets.total, prevAssets.total);
    const verifiedChange = calcChange(currAssets.verified, prevAssets.verified);
    const pendingChange  = calcChange(currAssets.pending, prevAssets.pending);
    const critChange     = calcChange(critNow.n, critPrev.n);

    return {
      totalAssets:    { change: Math.abs(totalChange),    up: totalChange >= 0 },
      verifiedAssets: { change: Math.abs(verifiedChange), up: verifiedChange >= 0 },
      pendingAudit:   { change: Math.abs(pendingChange),  up: pendingChange >= 0 },
      criticalIssues: { change: Math.abs(critChange),     up: critChange <= 0 },
    };
  }

  async getTrends(req) {
    const { cf } = this._resolveClientFilter(req);

    const monthLabels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      monthLabels.push(d.toLocaleString('en-US', { month: 'short', year: 'numeric' }));
    }

    const additions = await sequelize.query(
      `SELECT DATE_FORMAT(purchase_date,'%b %Y') as month, COUNT(*) as count
       FROM assets WHERE purchase_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH) ${cf} GROUP BY month`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const disposals = await sequelize.query(
      `SELECT DATE_FORMAT(d.disposal_date,'%b %Y') as month, COUNT(*) as count
       FROM assetdisposals d
       INNER JOIN assets a ON a.id = d.asset_id
       WHERE d.disposal_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH) ${cf.replace(/client_id/g, 'a.client_id')}
       GROUP BY month`,
      { type: sequelize.QueryTypes.SELECT }
    ).catch(() => []);

    const verifications = await sequelize.query(
      `SELECT DATE_FORMAT(sl.scanned_at,'%b %Y') as month, COUNT(*) as count
       FROM asset_scan_logs sl
       INNER JOIN assets a ON a.id = sl.asset_id
       WHERE sl.scanned_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) ${cf.replace(/client_id/g, 'a.client_id')}
       GROUP BY month`,
      { type: sequelize.QueryTypes.SELECT }
    ).catch(() => []);

    const mapToMonths = (data) => {
      const map = new Map((data || []).map(r => [r.month, r.count]));
      return monthLabels.map(m => map.get(m) || 0);
    };

    return {
      labels: monthLabels,
      monthlyAdditions: mapToMonths(additions),
      monthlyDisposals: mapToMonths(disposals),
      verificationTrend: mapToMonths(verifications)
    };
  }
}

module.exports = new DashboardService();
