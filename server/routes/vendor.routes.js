const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendor.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(protect);
router.use(tenantMiddleware);

router.get('/', authorize('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT'), vendorController.getVendors);
router.post('/', authorize('ADMIN', 'SUPER_ADMIN'), vendorController.createVendor);
router.get('/compliance-dashboard', authorize('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT', 'CLIENT_ADMIN', 'PROVIDER_ADMIN'), vendorController.getComplianceDashboard);
router.get('/:id', authorize('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT'), vendorController.getVendorById);
router.put('/:id', authorize('ADMIN', 'SUPER_ADMIN'), vendorController.updateVendor);
router.delete('/:id', authorize('SUPER_ADMIN'), vendorController.deleteVendor);

module.exports = router;
