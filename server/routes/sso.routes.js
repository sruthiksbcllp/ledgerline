'use strict';
const express = require('express');
const router = express.Router();
const ssoCtrl = require('../controllers/sso.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

// SSO callbacks (no auth — these are IdP-initiated)
router.post('/saml/callback', ssoCtrl.samlCallback);
router.get('/oidc/callback', ssoCtrl.oidcCallback);

// Admin config (protected)
router.use(verifyToken);
router.use(tenantMiddleware);
router.get('/config', ssoCtrl.getSSOConfig);
router.post('/config', ssoCtrl.upsertSSOConfig);
router.delete('/config/:id', ssoCtrl.deleteSSOConfig);

module.exports = router;
