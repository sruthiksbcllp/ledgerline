'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/billApprovals.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const { blockWhenFinancialYearClosed } = require('../middleware/financialLock.middleware');

// Bill Approvals. Each action checks its own rule (limit, submitter, stage); admins always pass.
router.use(verifyToken);
router.use(tenantMiddleware);
router.use(rbacMiddleware(['MANAGER', 'FINANCE', 'DIRECTOR_CFO', 'PROCUREMENT', 'WAREHOUSE', 'ACCOUNTS_PAYABLE']));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(ctrl.list));
router.post('/:id/approve', blockWhenFinancialYearClosed, wrap(ctrl.approve));
router.post('/:id/reject', blockWhenFinancialYearClosed, wrap(ctrl.reject));
router.post('/:id/review', wrap(ctrl.review));
router.post('/:id/decide', blockWhenFinancialYearClosed, wrap(ctrl.decide));

module.exports = router;
