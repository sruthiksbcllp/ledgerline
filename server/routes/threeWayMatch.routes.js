const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/threeWayMatch.controller');
const { verifyToken, authorize } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/invoices', ctrl.getInvoiceStatuses);
router.post('/match/:invoiceId', ctrl.runMatch);
router.get('/match/:invoiceId', ctrl.getMatchStatus);
router.get('/tolerance-rules', ctrl.getToleranceRules);
router.post('/tolerance-rules', authorize('PROVIDER_ADMIN', 'SUPER_ADMIN', 'ADMIN', 'DEV_ADMIN'), ctrl.saveToleranceRule);

module.exports = router;

