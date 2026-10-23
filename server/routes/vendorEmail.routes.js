'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vendorEmail.controller');
const { protect, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const asyncHandler = require('../utils/asyncHandler');

// Vendor emails for awarded RFQ quotations. Preparing a draft is open to procurement;
// editing, approving/sending and cancelling are admin-only, and sending uses the
// approving admin's own connected mailbox.
router.use(protect);
router.use(tenantMiddleware);

router.get('/mailbox', requireSeniorAdmin, asyncHandler(ctrl.getMailbox));
router.put('/mailbox', requireSeniorAdmin, asyncHandler(ctrl.saveMailbox));
router.delete('/mailbox', requireSeniorAdmin, asyncHandler(ctrl.deleteMailbox));
router.post('/mailbox/test', requireSeniorAdmin, asyncHandler(ctrl.testMailbox));
router.get('/oauth/providers', requireSeniorAdmin, asyncHandler(ctrl.oauthProviders));
router.get('/oauth/:provider/start', requireSeniorAdmin, asyncHandler(ctrl.oauthStart));

router.get('/', rbacMiddleware(['PROCUREMENT', 'FINANCE']), asyncHandler(ctrl.list));
router.post('/prepare', rbacMiddleware(['PROCUREMENT', 'FINANCE']), asyncHandler(ctrl.prepare));
router.get('/:id', rbacMiddleware(['PROCUREMENT', 'FINANCE']), asyncHandler(ctrl.detail));
router.put('/:id', requireSeniorAdmin, asyncHandler(ctrl.update));
router.post('/:id/send', requireSeniorAdmin, asyncHandler(ctrl.send));
router.post('/:id/cancel', requireSeniorAdmin, asyncHandler(ctrl.cancel));

module.exports = router;
