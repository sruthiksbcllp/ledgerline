'use strict';
const express = require('express');
const router = express.Router();
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const ctrl = require('../controllers/notificationSettings.controller');

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/recipients', checkPermission('SETTINGS', 'VIEW'), ctrl.getRecipients);
router.put('/recipients', checkPermission('SETTINGS', 'MANAGE'), ctrl.setRecipients);

module.exports = router;
