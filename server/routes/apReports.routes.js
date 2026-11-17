'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/apReports.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

// AP reports on Accounts Payable Management (read-only): the roles that see that page; admins always pass.
router.use(verifyToken);
router.use(tenantMiddleware);
router.use(rbacMiddleware(['FINANCE', 'ACCOUNTS_PAYABLE', 'DIRECTOR_CFO', 'MANAGEMENT']));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/cycle-time', wrap(ctrl.cycleTime));
router.get('/exceptions', wrap(ctrl.exceptions));

module.exports = router;
