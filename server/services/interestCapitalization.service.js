'use strict';
const { CwipProject, CwipEntry } = require('../models');
const { Op } = require('sequelize');

/**
 * Interest Capitalization Service — Ind AS 23 / AS 16
 *
 * Capitalizes borrowing cost on CWIP projects during the qualifying period
 * (from interest_start_date until capitalization/interest_end_date).
 *
 * Weighted-average method: interest = project_cost * (borrowing_rate / 100) * (days / 365)
 */

/**
 * Calculate interest to capitalize for a single project up to a given date.
 * Does NOT persist — caller decides whether to save.
 */
function calculateInterest(project, asOfDate = new Date()) {
  const rate = parseFloat(project.borrowing_rate || 0);
  if (rate <= 0) return { interest: 0, days: 0, rate };

  const startDate = project.interest_start_date
    ? new Date(project.interest_start_date)
    : (project.start_date ? new Date(project.start_date) : null);
  if (!startDate) return { interest: 0, days: 0, rate };

  const endDate = project.interest_end_date
    ? new Date(project.interest_end_date)
    : asOfDate;

  const days = Math.max(0, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)));
  if (days === 0) return { interest: 0, days: 0, rate };

  // Weighted-average cost base: total expenses accumulated
  const costBase = parseFloat(project.total_cost || 0);
  const interest = costBase * (rate / 100) * (days / 365);

  return {
    interest: Math.round(interest * 100) / 100,
    days,
    rate,
    costBase,
    startDate,
    endDate
  };
}

/**
 * Accrue interest for a project and persist to DB.
 * Called manually or by monthly scheduler.
 */
async function accrueInterest(projectId, asOfDate = new Date()) {
  const project = await CwipProject.findByPk(projectId);
  if (!project) throw new Error('Project not found');
  if (project.status === 'CAPITALIZED') throw new Error('Project already capitalized — interest frozen');
  if (parseFloat(project.borrowing_rate || 0) <= 0) {
    return { interest: 0, message: 'No borrowing rate configured' };
  }

  const calc = calculateInterest(project, asOfDate);
  if (calc.interest <= 0) return { interest: 0, message: 'No interest to accrue' };

  // Update project with new interest amount
  const prevInterest = parseFloat(project.interest_capitalized || 0);
  const newInterest = calc.interest; // total interest (not incremental)

  await project.update({
    interest_capitalized: newInterest,
    total_cost: parseFloat(project.total_cost || 0) - prevInterest + newInterest
  });

  return {
    interest: newInterest,
    delta: newInterest - prevInterest,
    days: calc.days,
    rate: calc.rate,
    costBase: calc.costBase
  };
}

/**
 * Freeze interest on capitalization — sets interest_end_date and finalizes amount.
 */
async function freezeInterest(projectId) {
  const project = await CwipProject.findByPk(projectId);
  if (!project) return;

  if (parseFloat(project.borrowing_rate || 0) > 0 && !project.interest_end_date) {
    const calc = calculateInterest(project, new Date());
    await project.update({
      interest_end_date: new Date(),
      interest_capitalized: calc.interest,
      total_cost: parseFloat(project.total_cost || 0) - parseFloat(project.interest_capitalized || 0) + calc.interest
    });
  }
}

/**
 * Run monthly interest accrual for all active CWIP projects with borrowing rates.
 */
async function monthlyAccrual(clientId) {
  const where = {
    status: { [Op.notIn]: ['CAPITALIZED', 'CLOSED'] },
    borrowing_rate: { [Op.gt]: 0 }
  };
  if (clientId) where.client_id = clientId;

  const projects = await CwipProject.findAll({ where });
  const results = [];

  for (const proj of projects) {
    const r = await accrueInterest(proj.id);
    results.push({ project_id: proj.id, project_name: proj.project_name, ...r });
  }

  return results;
}

module.exports = {
  calculateInterest,
  accrueInterest,
  freezeInterest,
  monthlyAccrual
};
