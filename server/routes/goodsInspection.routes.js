'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/goodsInspection.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const { requireRead } = require('../middleware/dataAccess.middleware');

// Goods Inspection Reports on GRNs. Anyone who may see goods receipts reads them; Warehouse,
// Procurement and Compliance record them. Admins always pass.
router.use(verifyToken);
router.use(tenantMiddleware);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', requireRead('GRN'), wrap(ctrl.list));
router.get('/grn/:grnId', requireRead('GRN'), wrap(ctrl.forGrn));
router.post('/', rbacMiddleware(['WAREHOUSE', 'PROCUREMENT', 'COMPLIANCE']), wrap(ctrl.save));

module.exports = router;
