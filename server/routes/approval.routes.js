'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/approval.controller');
const { protect, authorize, requireSeniorAdmin } = require('../middleware/auth.middleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(protect);
router.use(tenantMiddleware);

// ─── Document Actions ──────────────────────────────────────────────────────
router.post('/:module/:id/approve', ctrl.approveDocument);
router.post('/:module/:id/reject', ctrl.rejectDocument);
router.get('/:module/:id/history', ctrl.getApprovalHistory);

// ─── My Approvals ─────────────────────────────────────────────────────────
router.get('/pending', ctrl.getPendingApprovals);
router.get('/history/my', ctrl.getMyApprovalHistory);

// ─── Matrix Admin (Super Admin / Client Admin only) ───────────────────────
router.get('/matrix', rbacMiddleware(['PROVIDER_ADMIN', 'SUPER_ADMIN', 'ADMIN', 'CLIENT_ADMIN']), ctrl.getMatrix);
router.post('/matrix', requireSeniorAdmin, ctrl.createMatrixRule);
router.put('/matrix/workflow/:module', requireSeniorAdmin, ctrl.updateWorkflowConfig);
router.put('/matrix/:id', requireSeniorAdmin, ctrl.updateMatrixRule);
router.delete('/matrix/:id', requireSeniorAdmin, ctrl.deleteMatrixRule);

module.exports = router;
