const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rfq.controller');
const { protect } = require('../middleware/auth.middleware');
const checkPermission = require('../middleware/checkPermission');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const checkFeature = require('../middleware/featureGuard.middleware');

router.use(protect);
router.use(tenantMiddleware);
router.use(checkFeature('RFQ_MODULE'));

router.get('/', ctrl.getRfqs);
router.get('/:id', ctrl.getRfqById);
router.post('/', checkPermission('PR', 'CREATE'), ctrl.createRfq);
router.post('/:id/send', checkPermission('PR', 'EDIT'), ctrl.sendRfq);
router.post('/:id/vendors/:vendorId/response', checkPermission('PR', 'CREATE'), ctrl.recordResponse);
router.post('/:id/close', checkPermission('PR', 'EDIT'), ctrl.closeRfq);

module.exports = router;
