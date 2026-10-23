'use strict';
const express = require('express');
const router = express.Router();
const sessionCtrl = require('../controllers/session.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/active', sessionCtrl.getActiveSessions);
router.delete('/:id', sessionCtrl.revokeSession);
router.delete('/', sessionCtrl.revokeAllSessions);
router.get('/config', sessionCtrl.getSessionConfig);
router.put('/config', sessionCtrl.updateSessionConfig);

module.exports = router;
