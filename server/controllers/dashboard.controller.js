'use strict';

const dashboardService = require('../services/dashboard.service');

/**
 * Controller for Enterprise Asset Dashboard
 */

/**
 * @route GET /api/dashboard/summary
 * @desc Returns real-time financial and audit readiness summary
 */
exports.getSummary = async (req, res) => {
  try {
    const summary = await dashboardService.getSummary(req);
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load dashboard summary' });
  }
};

exports.getAlerts = async (req, res) => {
  try {
    const alerts = await dashboardService.getAlerts(req);
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    res.json({
      success: true,
      data: [],
      message: "Safe fallback response"
    });
  }
};

exports.getTrends = async (req, res) => {
  try {
    const trends = await dashboardService.getTrends(req);
    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        labels: [],
        monthlyAdditions: [],
        monthlyDisposals: [],
        verificationTrend: []
      },
      message: "Safe fallback response"
    });
  }
};

exports.getAssetStats = async (req, res) => {
  try {
    const distribution = await dashboardService.getCategoryDistribution(req);
    res.json({
      success: true,
      data: distribution
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Internal Server Error' });
  }
};


exports.getMonthOverMonth = async (req, res) => {
  try {
    const data = await dashboardService.getMonthOverMonth(req);
    res.json({ success: true, data });
  } catch (error) {
    res.json({
      success: true,
      data: {
        totalAssets:    { change: 0, up: true },
        verifiedAssets: { change: 0, up: true },
        pendingAudit:   { change: 0, up: true },
        criticalIssues: { change: 0, up: true },
      }
    });
  }
};

exports.getAlertStats = exports.getAlerts;
exports.getApprovalStats = async (req, res) => {
  res.json({ success: true, data: { pendingRequests: [], approvedToday: 0, rejectedRequests: 0 } });
};
