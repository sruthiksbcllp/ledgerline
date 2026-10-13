const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vendorCategory.controller');
const { protect } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const checkFeature = require('../middleware/featureGuard.middleware');
const checkPermission = require('../middleware/checkPermission');

router.use(protect);
router.use(tenantMiddleware);
router.use(checkFeature('VENDOR_CATEGORISATION'));

router.get('/suggest', ctrl.suggestByCategory);   // before /:vendorId
router.get('/:vendorId', ctrl.getCategories);
router.post('/:vendorId', checkPermission('PR', 'EDIT'), ctrl.setCategories);

module.exports = router;
