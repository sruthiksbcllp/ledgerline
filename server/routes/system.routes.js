'use strict';
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system.controller');
const { protect, requireProviderAdmin } = require('../middleware/auth.middleware');
const { requireMfaForPrivileged } = require('../middleware/mfa.middleware');

// Keep health public; all other system APIs are provider-admin only.
router.get('/health', systemController.getHealth);
router.use(protect);
router.use(requireMfaForPrivileged);
router.get('/features', systemController.getAllFeatures);
router.use(requireProviderAdmin);
router.get('/settings', systemController.getSettings);
router.get('/global-settings', systemController.getGlobalSettings);
router.put('/settings', systemController.updateSettings);
router.put('/features/:key', systemController.updateFeature);

module.exports = router;
