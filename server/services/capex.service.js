'use strict';

const { Op } = require('sequelize');
const { CapexBudgetPlan, CapexProjection, CapexRequestPlan, Department } = require('../models');
const ExportService = require('./ExportService');

const buildMonthlyCapexPayload = async (clientId, month) => {
  const budgets = await CapexBudgetPlan.findAll({
    where: { client_id: clientId },
    include: [{ model: Department, attributes: ['id', 'dept_name'] }]
  });
  const requestsRaw = await CapexRequestPlan.findAll({
    where: { client_id: clientId }
  });
  const requests = requestsRaw.filter((row) => {
    const d = row.createdAt || row.created_at || row.created_on || row.request_date;
    if (!d) return true;
    const iso = new Date(d).toISOString().slice(0, 7);
    return iso === month;
  });
  // Compute last day of the month safely (avoids invalid dates like 2026-06-31)
  const monthStart = new Date(`${month}-01`);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const endStr = monthEnd.toISOString().slice(0, 10);
  const projections = await CapexProjection.findAll({
    where: {
      client_id: clientId,
      projection_month: {
        [Op.gte]: `${month}-01`,
        [Op.lte]: endStr
      }
    }
  });

  const topDepartments = budgets
    .map((budget) => ({
      department: budget.Department?.dept_name || 'Unassigned',
      actual_spend: Number(budget.actual_spend || 0),
      committed_spend: Number(budget.committed_spend || 0),
      allocated_amount: Number(budget.allocated_amount || 0)
    }))
    .sort((a, b) => b.actual_spend - a.actual_spend)
    .slice(0, 5);

  const ytdSummary = budgets.reduce((acc, row) => {
    acc.budgeted += Number(row.allocated_amount || 0);
    acc.approved += Number(row.approved_amount || 0);
    acc.actual += Number(row.actual_spend || 0);
    acc.committed += Number(row.committed_spend || 0);
    return acc;
  }, { budgeted: 0, approved: 0, actual: 0, committed: 0 });

  return {
    month,
    budgets,
    requests,
    projections,
    newApprovals: requests.filter((row) => row.status === 'APPROVED' || row.status === 'PROCURED'),
    pendingRequests: requests.filter((row) => row.status === 'REQUESTED' || row.status === 'UNDER_REVIEW'),
    topDepartments,
    ytdSummary
  };
};

const exportMonthlyCapexPayload = async (payload, format) => {
  const rows = payload.budgets.map((budget) => ({
    financial_year: budget.financial_year,
    department: budget.Department?.dept_name || 'Unassigned',
    allocated_amount: budget.allocated_amount,
    approved_amount: budget.approved_amount,
    actual_spend: budget.actual_spend,
    committed_spend: budget.committed_spend
  }));
  const columns = [
    { header: 'Financial Year', key: 'financial_year' },
    { header: 'Department', key: 'department' },
    { header: 'Allocated', key: 'allocated_amount' },
    { header: 'Approved', key: 'approved_amount' },
    { header: 'Actual', key: 'actual_spend' },
    { header: 'Committed', key: 'committed_spend' }
  ];
  if (format === 'pdf') {
    return ExportService.exportToPdf(rows, columns, `Capex Monthly Report ${payload.month}`);
  }
  return ExportService.exportToExcel(rows, columns, `Capex Report ${payload.month}`);
};

module.exports = {
  buildMonthlyCapexPayload,
  exportMonthlyCapexPayload
};
