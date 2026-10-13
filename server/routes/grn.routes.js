const express = require('express');
const router = express.Router();
const grnController = require('../controllers/grn.controller');
const { protect } = require('../middleware/auth.middleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const { blockWhenFinancialYearClosed } = require('../middleware/financialLock.middleware');
const checkPermission = require('../middleware/checkPermission');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(protect);
router.use(tenantMiddleware);

// Must be before /:id to avoid Express treating 'purchase-orders' as an id param
router.get('/purchase-orders', grnController.getApprovedPOs);
router.get('/', grnController.getGRNs);
router.get('/:id', grnController.getGRNById);
router.post('/create', checkPermission('ASSET', 'CREATE'), blockWhenFinancialYearClosed, grnController.createGRN);

module.exports = router;
