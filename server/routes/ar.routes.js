'use strict';
const express = require('express');
const router = express.Router();
const ar = require('../controllers/arAutomation.controller');
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { blockWhenFinancialYearClosed } = require('../middleware/financialLock.middleware');
const { aiDocumentUpload } = require('../middleware/aiDocumentUpload');
const asyncHandler = require('../utils/asyncHandler');

// Accounts Receivable: customer invoices, receipts and overdue reminders (AR permission section).
router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/customers', checkPermission('AR', 'view'), asyncHandler(ar.customers));
router.get('/invoices', checkPermission('AR', 'view'), asyncHandler(ar.list));
router.get('/invoices/:id', checkPermission('AR', 'view'), asyncHandler(ar.detail));
router.post('/invoices/extract', checkPermission('AR', 'add'), aiDocumentUpload, asyncHandler(ar.extract));
router.post('/invoices/validate', checkPermission('AR', 'add'), asyncHandler(ar.validate));
router.post('/invoices', checkPermission('AR', 'add'), blockWhenFinancialYearClosed, asyncHandler(ar.create));
router.post('/invoices/:id/receipts', checkPermission('AR', 'add'), blockWhenFinancialYearClosed, asyncHandler(ar.recordReceipt));
router.put('/invoices/:id/cancel', checkPermission('AR', 'edit'), blockWhenFinancialYearClosed, asyncHandler(ar.cancel));
router.post('/invoices/:id/remind', checkPermission('AR', 'edit'), asyncHandler(ar.remind));
router.post('/reminders/overdue', checkPermission('AR', 'edit'), asyncHandler(ar.remindAllOverdue));

module.exports = router;
