'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/doaConfig.controller');
const { protect, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const asyncHandler = require('../utils/asyncHandler');

const admin = rbacMiddleware(['PROVIDER_ADMIN', 'SUPER_ADMIN', 'ADMIN', 'CLIENT_ADMIN']);
router.use(protect);
router.use(tenantMiddleware);

// Reads: any admin. WRITES (save/delete policy, department heads): Super-Admin-only (approval
// configuration is a governance action — plain 'Administrator' excluded).
router.get('/meta', admin, asyncHandler(ctrl.getMeta));
router.get('/policies', admin, asyncHandler(ctrl.listPolicies));
router.get('/policies/:id', admin, asyncHandler(ctrl.getPolicy));
router.post('/policies', requireSeniorAdmin, asyncHandler(ctrl.savePolicy));
router.delete('/policies/:id', requireSeniorAdmin, asyncHandler(ctrl.deletePolicy));
router.get('/department-heads', admin, asyncHandler(ctrl.getDepartmentHeads));
router.get('/preview-chain', admin, asyncHandler(ctrl.previewChain));
router.post('/preview-chain', admin, asyncHandler(ctrl.previewChain));
router.post('/department-heads', requireSeniorAdmin, asyncHandler(ctrl.saveDepartmentHead));

module.exports = router;
