'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboard.controller');
const securityCtrl = require('../controllers/security.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const activityLog = require('../middleware/activityLog.middleware');

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/summary', activityLog('DASHBOARD', 'MODULE'), ctrl.getSummary);
router.get('/alerts', ctrl.getAlerts);
router.get('/trends', ctrl.getTrends);

// Legacy/Extended stats
router.get('/month-over-month', ctrl.getMonthOverMonth);
router.get('/assets', ctrl.getAssetStats);
router.get('/approvals', ctrl.getApprovalStats);
router.get('/recommendations', (req, res) => {
  res.json({ success: true, data: [] });
});

router.get('/security', securityCtrl.getSecurityMetrics);

module.exports = router;
