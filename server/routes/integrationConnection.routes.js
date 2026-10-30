'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/integrationConnection.controller');
const { protect, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { PROVIDERS } = require('../services/integrations/providers');

const knownProvider = (req, res, next) => (Object.hasOwn(PROVIDERS, req.params.provider) ? next() : res.status(404).json({ success: false, message: 'Unknown integration' }));

// Settings → Integrations. The OAuth callback is public (see controller); everything else is
// company-admin only and scoped to the admin's selected company.
router.get('/oauth/:provider/callback', knownProvider, asyncHandler(ctrl.oauthCallback));

router.use(protect);
router.use(tenantMiddleware);
router.use(requireSeniorAdmin);

router.get('/connections', asyncHandler(ctrl.list));
router.post('/connections/:provider/oauth/start', knownProvider, asyncHandler(ctrl.oauthStart));
router.put('/connections/:provider', knownProvider, asyncHandler(ctrl.saveCredentials));
router.post('/connections/:provider/test', knownProvider, asyncHandler(ctrl.test));
router.delete('/connections/:provider', knownProvider, asyncHandler(ctrl.disconnect));

// Zoho Books sync: vendors, approved bills and payments (also automatic on approval / payment).
const zoho = require('../controllers/zohoBooks.controller');
router.get('/zoho_books/status', asyncHandler(zoho.status));
router.get('/zoho_books/mapping', asyncHandler(zoho.mapping));
router.put('/zoho_books/settings', asyncHandler(zoho.saveSettings));
router.post('/zoho_books/sync', asyncHandler(zoho.syncNow));

module.exports = router;
