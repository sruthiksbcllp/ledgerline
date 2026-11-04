'use strict';
const express = require('express');
const router = express.Router();
const stock = require('../controllers/inHouseStock.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

// Everyone in the company can see what the store holds (requesters check it before raising a PR).
// Adding stock, issuing it and loading sample stock are for the store, procurement and admins.
const issuers = rbacMiddleware(['WAREHOUSE', 'PROCUREMENT']);

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/', stock.list);
router.get('/issues', stock.issues);
router.get('/receipts', stock.receipts);
router.post('/receive', issuers, stock.receive);
router.post('/issue', issuers, stock.issue);
router.post('/sample', issuers, stock.loadSample);

module.exports = router;
