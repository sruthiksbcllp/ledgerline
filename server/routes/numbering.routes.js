'use strict';
const express = require('express');
const router = express.Router();
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const ctrl = require('../controllers/numbering.controller');

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/', checkPermission('SETTINGS', 'VIEW'), ctrl.getConfigs);
router.get('/:id', checkPermission('SETTINGS', 'VIEW'), ctrl.getConfig);
router.post('/', checkPermission('SETTINGS', 'MANAGE'), ctrl.createConfig);
router.post('/preview', checkPermission('SETTINGS', 'VIEW'), ctrl.previewNumber);
router.put('/:id', checkPermission('SETTINGS', 'MANAGE'), ctrl.updateConfig);
router.delete('/:id', checkPermission('SETTINGS', 'MANAGE'), ctrl.deleteConfig);

module.exports = router;
