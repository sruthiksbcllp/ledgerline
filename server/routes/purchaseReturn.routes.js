'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/purchaseReturn.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const { requireRead } = require('../middleware/dataAccess.middleware');
const { blockWhenFinancialYearClosed } = require('../middleware/financialLock.middleware');

// Purchase returns against GRNs. Anyone who may see goods receipts reads them; Warehouse,
// Procurement and AP/Finance record them; AP/Finance record the vendor's credit note. Admins always pass.
router.use(verifyToken);
router.use(tenantMiddleware);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', requireRead('GRN'), wrap(ctrl.list));
router.get('/grn/:grnId', requireRead('GRN'), wrap(ctrl.returnable));
router.post('/', rbacMiddleware(['WAREHOUSE', 'PROCUREMENT', 'ACCOUNTS_PAYABLE', 'FINANCE']), blockWhenFinancialYearClosed, wrap(ctrl.create));
router.put('/:id/credit-note', rbacMiddleware(['ACCOUNTS_PAYABLE', 'FINANCE']), wrap(ctrl.recordCreditNote));

module.exports = router;
