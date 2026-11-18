'use strict';
const express = require('express');
const router = express.Router();
const r2r = require('../controllers/r2r.controller');
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { hasPermission } = require('../utils/permission');
const asyncHandler = require('../utils/asyncHandler');

// Record to Report on the posted ledger (R2R permission section, config/rbac.js). Reading the ledger
// changes nothing; manual journals, reconciliations and close steps are maker-checker, and the
// controller checks who may approve, review or close.
router.use(verifyToken);
router.use(tenantMiddleware);

const view = checkPermission('R2R', 'view');
const add = checkPermission('R2R', 'add');
const edit = checkPermission('R2R', 'edit');
/** Passes when the user holds any one of the given section / action pairs. */
const anyOf = (...pairs) => async (req, res, next) => {
  for (const [section, action] of pairs) if (await hasPermission(req.user, section, action)) return next();
  return res.status(403).json({ success: false, message: 'Access denied' });
};
const prepareOrApprove = anyOf(['R2R', 'add'], ['R2R', 'edit']);

router.get('/accounts', view, asyncHandler(r2r.accounts));
router.post('/accounts', edit, asyncHandler(r2r.addAccount));
router.get('/ledger', view, asyncHandler(r2r.ledger));
router.get('/trial-balance', view, asyncHandler(r2r.trialBalance));
router.get('/statements', view, asyncHandler(r2r.statements));

router.get('/journals', view, asyncHandler(r2r.listJournals));
router.post('/journals', add, asyncHandler(r2r.createJournal));
router.post('/journals/:id/approve', edit, asyncHandler(r2r.approveJournal));
router.post('/journals/:id/reject', prepareOrApprove, asyncHandler(r2r.rejectJournal));

router.get('/reconciliations', view, asyncHandler(r2r.reconciliations));
router.post('/reconciliations', add, asyncHandler(r2r.saveReconciliation));
router.post('/reconciliations/:id/review', edit, asyncHandler(r2r.reviewReconciliation));

router.get('/close', view, asyncHandler(r2r.getPeriodClose));
router.post('/close/:period/tasks/:key', prepareOrApprove, asyncHandler(r2r.toggleCloseTask));

module.exports = router;
