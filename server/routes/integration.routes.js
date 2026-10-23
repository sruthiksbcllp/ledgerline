'use strict';
const express = require('express');
const router = express.Router();
const integrationController = require('../controllers/integration.controller');
const { protect, requireProviderAdmin } = require('../middleware/auth.middleware');
const { requireMfaForPrivileged } = require('../middleware/mfa.middleware');
const { verifyApiKey } = require('../middleware/apiKeyAuth.middleware');

// External endpoints (API-key auth - called by Oracle Fusion / ERP)
router.post('/webhook', verifyApiKey, integrationController.webhook);
router.get('/gl-export', verifyApiKey, integrationController.glExport);

// Internal endpoints (JWT + PROVIDER_ADMIN)
router.use(protect);
router.use(requireMfaForPrivileged);
router.use(requireProviderAdmin);

router.get('/configs', integrationController.getConfigs);
router.post('/configs', integrationController.saveConfig);
router.get('/queue', integrationController.getQueue);
router.get('/logs', integrationController.getLogs);
router.post('/sync', integrationController.pushManualSync);
router.get('/assets/:reference', integrationController.fetchAssetFromErp);

// GL export also available to PROVIDER_ADMIN via JWT (no API key needed)
router.get('/gl-export-internal', integrationController.glExport);

// API key management (PROVIDER_ADMIN only, JWT-authenticated)
router.get('/api-keys', integrationController.getKeys);
router.post('/api-keys', integrationController.generateApiKey);
router.delete('/api-keys/:id', integrationController.revokeKey);

module.exports = router;
