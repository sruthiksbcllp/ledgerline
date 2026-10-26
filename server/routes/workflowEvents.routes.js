'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/workflowEvents.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

// Activity trail of AP documents: role | user, action, status, date and time.
router.use(verifyToken);
router.use(tenantMiddleware);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/:module/latest', wrap(ctrl.getLatest)); // ?ids=1,2,3 -> { [id]: latest event }
router.get('/:module/:id', wrap(ctrl.getTrail));
router.post('/:module/:id/step', wrap(ctrl.recordStep)); // browser-side steps (payment proposal)

module.exports = router;
