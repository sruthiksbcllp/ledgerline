'use strict';
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system.controller');
const { protect, requireProviderAdmin, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { requireMfaForPrivileged } = require('../middleware/mfa.middleware');

// Keep health public; all other system APIs are provider-admin only.
router.get('/health', systemController.getHealth);
router.use(protect);
router.use(requireMfaForPrivileged);
router.get('/features', systemController.getAllFeatures);
router.get('/settings', requireSeniorAdmin, systemController.getSettings);
router.get('/global-settings', requireSeniorAdmin, systemController.getGlobalSettings);
router.put('/settings', requireProviderAdmin, systemController.updateSettings);
router.put('/global-settings', requireProviderAdmin, systemController.updateSettings);
router.post('/global-settings', requireProviderAdmin, systemController.updateSettings);
router.use(requireProviderAdmin);
router.put('/features/:key', systemController.updateFeature);

module.exports = router;
