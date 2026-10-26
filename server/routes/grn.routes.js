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
const { requireRead } = require('../middleware/dataAccess.middleware');

// Must be before /:id to avoid Express treating 'purchase-orders' as an id param
router.get('/purchase-orders', requireRead('GRN'), grnController.getApprovedPOs);
router.get('/', requireRead('GRN'), grnController.getGRNs);
router.get('/:id', requireRead('GRN'), grnController.getGRNById);
// Recording a receipt is the GRN permission (Warehouse: GRN add), not the legacy asset permission.
router.post('/create', rbacMiddleware(['WAREHOUSE']), checkPermission('GRN', 'CREATE'), blockWhenFinancialYearClosed, grnController.createGRN);

module.exports = router;
