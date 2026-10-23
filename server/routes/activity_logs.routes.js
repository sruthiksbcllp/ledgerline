'use strict';
const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLog.controller');
const { protect, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(protect);
router.use(tenantMiddleware);

router.get('/', requireSeniorAdmin, activityLogController.getLogs);

module.exports = router;
