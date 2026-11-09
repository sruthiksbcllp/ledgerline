'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/msmePayments.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

// MSME 45-day payment report. Finance roles read it; admins always pass.
router.use(verifyToken);
router.use(tenantMiddleware);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', rbacMiddleware(['FINANCE', 'ACCOUNTS_PAYABLE', 'DIRECTOR_CFO', 'MANAGEMENT']), wrap(ctrl.report));

module.exports = router;
