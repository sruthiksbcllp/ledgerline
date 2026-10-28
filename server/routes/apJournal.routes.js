'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/apJournal.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const { requireRead } = require('../middleware/dataAccess.middleware');

// AP journal entries and account balances. Finance roles read them; admins always pass.
router.use(verifyToken);
router.use(tenantMiddleware);

const readers = rbacMiddleware(['FINANCE', 'ACCOUNTS_PAYABLE', 'DIRECTOR_CFO', 'MANAGEMENT']);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', readers, wrap(ctrl.list));
router.get('/balances', readers, wrap(ctrl.balances));
router.get('/source/:module/:id', readers, wrap(ctrl.bySource));
// Entry preview on the GRN screen: anyone who may see goods receipts (incl. Warehouse, who records them).
router.get('/preview/receipt/:poId', requireRead('GRN'), wrap(ctrl.receiptPreview));
router.post('/backfill', rbacMiddleware(['FINANCE']), wrap(ctrl.backfill));
router.get('/:id', readers, wrap(ctrl.getOne));

module.exports = router;
