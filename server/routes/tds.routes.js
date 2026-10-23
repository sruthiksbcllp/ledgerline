'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tds.controller');
const { verifyToken, authorize, requireProviderAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/computations', ctrl.getTDSComputation);
router.post('/compute/:invoiceId', ctrl.computeTDS);
router.get('/sections', ctrl.getSections);
// TDS sections are statutory reference data shared by every company.
router.put('/sections/:id', requireProviderAdmin, ctrl.updateSection);

module.exports = router;

