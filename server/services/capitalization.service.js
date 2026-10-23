'use strict';

const { CompanyPolicy, CapexBudgetPlan, Asset, Company } = require('../models');

/**
 * Classify whether an asset should be CAPITALIZE or EXPENSE
 * based on CompanyPolicy.min_cost_to_capitalize threshold.
 *
 * @param {number} cost - Total cost of the asset
 * @param {number} companyId - Company ID (from multi-company context)
 * @param {number} clientId - Client ID (tenant)
 * @returns {{ type: 'CAPITALIZE'|'EXPENSE', threshold: number, auto: boolean }}
 */
const classifyAsset = async (cost, { companyId, clientId }) => {
  const numericCost = Number(cost || 0);
  if (numericCost <= 0) return { type: 'EXPENSE', threshold: 0, auto: true };

  let threshold = 5000; // Default ₹5,000

  // Try company-level policy first
  if (companyId) {
    const policy = await CompanyPolicy.findOne({ where: { company_id: companyId } });
    if (policy && policy.min_cost_to_capitalize != null) {
      threshold = Number(policy.min_cost_to_capitalize);
    }
  }

  // If no company policy, check if there's a client-level default
  if (!companyId && clientId) {
    const company = await Company.findOne({ where: { client_id: clientId }, include: [{ model: CompanyPolicy, as: 'policy' }] });
    if (company?.policy?.min_cost_to_capitalize != null) {
      threshold = Number(company.policy.min_cost_to_capitalize);
    }
  }

  return {
    type: numericCost >= threshold ? 'CAPITALIZE' : 'EXPENSE',
    threshold,
    auto: true
  };
};

/**
 * Sync capex budget actual_spend when an asset is created or capitalized.
 * Finds matching CapexBudgetPlan by department + category + financial year
 * and increments actual_spend.
 *
 * @param {Object} asset - Asset record (must have department_id, category_id, purchase_cost/total_cost, client_id)
 * @param {Object} options - { clientId }
 */
const syncCapexBudgetActual = async (asset, { clientId }) => {
  if (!asset) return null;

  const cost = Number(asset.purchase_cost || asset.total_cost || 0);
  if (cost <= 0) return null;

  const departmentId = asset.department_id;
  const categoryId = asset.category_id;
  if (!departmentId && !categoryId) return null;

  // Determine financial year: April-March cycle
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = (fyStart + 1) % 100;
  const financialYear = `${fyStart}-${String(fyEnd).padStart(2, '0')}`;

  const where = { client_id: clientId };
  if (departmentId) where.department_id = departmentId;
  if (categoryId) where.category_id = categoryId;
  where.financial_year = financialYear;

  const budget = await CapexBudgetPlan.findOne({ where });
  if (!budget) return null;

  await budget.update({
    actual_spend: Number(budget.actual_spend || 0) + cost
  });

  return {
    budget_id: budget.id,
    financial_year: financialYear,
    previous_actual: Number(budget.actual_spend || 0) - cost,
    new_actual: Number(budget.actual_spend || 0),
    asset_cost: cost
  };
};

/**
 * Get capitalization summary for a client — KPIs for the dashboard.
 *
 * @param {number} clientId
 * @param {string} financialYear - e.g. '2025-26'
 */
const getCapitalizationSummary = async (clientId, financialYear) => {
  const { Op, fn, col } = require('sequelize');

  const baseWhere = { client_id: clientId, is_budgetary: { [Op.not]: true } };

  // Get counts and values by capitalization_type
  const [capitalized, expensed] = await Promise.all([
    Asset.findAll({
      where: { ...baseWhere, capitalization_type: 'CAPITALIZE' },
      attributes: [[fn('COUNT', col('id')), 'count'], [fn('SUM', col('total_cost')), 'total']],
      raw: true
    }),
    Asset.findAll({
      where: { ...baseWhere, capitalization_type: 'EXPENSE' },
      attributes: [[fn('COUNT', col('id')), 'count'], [fn('SUM', col('total_cost')), 'total']],
      raw: true
    })
  ]);

  // Budget vs actual variance
  const budgetWhere = { client_id: clientId };
  if (financialYear) budgetWhere.financial_year = financialYear;

  const budgets = await CapexBudgetPlan.findAll({ where: budgetWhere, raw: true });
  const totalBudgeted = budgets.reduce((s, b) => s + Number(b.allocated_amount || 0), 0);
  const totalActual = budgets.reduce((s, b) => s + Number(b.actual_spend || 0), 0);
  const totalCommitted = budgets.reduce((s, b) => s + Number(b.committed_spend || 0), 0);

  return {
    capitalized: { count: Number(capitalized[0]?.count || 0), total: Number(capitalized[0]?.total || 0) },
    expensed: { count: Number(expensed[0]?.count || 0), total: Number(expensed[0]?.total || 0) },
    budget: { budgeted: totalBudgeted, actual: totalActual, committed: totalCommitted, variance: totalBudgeted - totalActual - totalCommitted }
  };
};

/**
 * Get budget vs actual variance report with department/category drill-down.
 *
 * @param {number} clientId
 * @param {string} financialYear
 */
const getBudgetVarianceReport = async (clientId, financialYear) => {
  const { Department, AssetCategory } = require('../models');

  const where = { client_id: clientId };
  if (financialYear) where.financial_year = financialYear;

  const budgets = await CapexBudgetPlan.findAll({
    where,
    include: [
      { model: Department, attributes: ['id', 'dept_name'] },
      { model: AssetCategory, attributes: ['id', 'category_name'] }
    ],
    order: [['id', 'ASC']]
  });

  return budgets.map(b => {
    const allocated = Number(b.allocated_amount || 0);
    const actual = Number(b.actual_spend || 0);
    const committed = Number(b.committed_spend || 0);
    const available = allocated - actual - committed;
    const utilization = allocated > 0 ? Math.round(((actual + committed) / allocated) * 100) : 0;

    return {
      id: b.id,
      financial_year: b.financial_year,
      department: b.Department?.dept_name || 'Unassigned',
      department_id: b.department_id,
      category: b.AssetCategory?.category_name || 'Unassigned',
      category_id: b.category_id,
      allocated,
      approved: Number(b.approved_amount || 0),
      actual,
      committed,
      available,
      utilization,
      status: utilization >= 100 ? 'OVER_BUDGET' : utilization >= 90 ? 'AT_RISK' : 'ON_TRACK'
    };
  });
};

module.exports = {
  classifyAsset,
  syncCapexBudgetActual,
  getCapitalizationSummary,
  getBudgetVarianceReport
};
