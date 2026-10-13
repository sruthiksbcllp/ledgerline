const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const ctrl = require('../controllers/gst.controller');

router.use(verifyToken);
router.use(tenantMiddleware);

router.post('/validate', ctrl.validate);
router.get('/invoice/:id/gst-check', ctrl.invoiceCheck);
router.get('/vendor/:id/gstin-status', ctrl.vendorStatus);

module.exports = router;

