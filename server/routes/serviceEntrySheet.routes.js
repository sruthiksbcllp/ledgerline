'use strict';
const express = require('express');
const router = express.Router();
const ses = require('../controllers/serviceEntrySheet.controller');
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { requireRead } = require('../middleware/dataAccess.middleware');
const { blockWhenFinancialYearClosed } = require('../middleware/financialLock.middleware');

// Service Entry Sheets (service receipts against POs). Who may confirm / review / approve is
// decided per SES in the controller (stage roles, segregation of duties, approval limit).
router.use(verifyToken);
router.use(tenantMiddleware);

// Must be before /:id so 'purchase-orders' is not taken as an id
router.get('/purchase-orders', requireRead('SES'), ses.getOpenPurchaseOrders);
router.get('/', requireRead('SES'), ses.getServiceEntrySheets);
router.get('/:id', requireRead('SES'), ses.getServiceEntrySheet);
router.post('/', requireRead('SES'), checkPermission('SES', 'add'), blockWhenFinancialYearClosed, ses.createServiceEntrySheet);
router.post('/:id/confirm', requireRead('SES'), ses.confirmServiceEntrySheet);
router.post('/:id/review', requireRead('SES'), ses.reviewServiceEntrySheet);
router.post('/:id/approve', requireRead('SES'), blockWhenFinancialYearClosed, ses.approveServiceEntrySheet);
router.post('/:id/reject', requireRead('SES'), ses.rejectServiceEntrySheet);

module.exports = router;
