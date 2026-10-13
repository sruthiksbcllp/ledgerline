'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tds.controller');
const { verifyToken, authorize } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/computations', ctrl.getTDSComputation);
router.post('/compute/:invoiceId', ctrl.computeTDS);
router.get('/sections', ctrl.getSections);
router.put('/sections/:id', authorize('PROVIDER_ADMIN', 'SUPER_ADMIN', 'ADMIN', 'DEV_ADMIN'), ctrl.updateSection);

module.exports = router;

