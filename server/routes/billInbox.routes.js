'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/billInbox.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

// Bill inbox: bills captured from email. The same roles that record AP invoices; admins always pass.
router.use(verifyToken);
router.use(tenantMiddleware);
router.use(rbacMiddleware(['ACCOUNTS_PAYABLE', 'FINANCE']));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(ctrl.list));
router.get('/count', wrap(ctrl.count));
router.post('/check', wrap(ctrl.checkNow));
router.get('/auto', wrap(ctrl.autoSettings));
router.put('/auto', wrap(ctrl.saveAutoSettings));
router.post('/sources', wrap(ctrl.watchMyMailbox));
router.put('/sources/:id', wrap(ctrl.updateSource));
router.delete('/sources/:id', wrap(ctrl.removeSource));
router.get('/:id', wrap(ctrl.detail));
router.get('/:id/file', wrap(ctrl.file));
router.get('/:id/returns', wrap(ctrl.openReturns));
router.post('/:id/reread', wrap(ctrl.reread));
router.put('/:id/status', wrap(ctrl.setStatus));
router.post('/:id/credit-note', wrap(ctrl.recordCreditNote));

module.exports = router;
