'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vendorEmail.controller');
const asyncHandler = require('../utils/asyncHandler');

// Public by necessity: Google/Microsoft redirect the browser here after sign-in.
// The admin is identified by the signed, single-use, 10-minute state, not by a login token.
router.get('/:provider/callback', (req, res, next) => (['google', 'microsoft'].includes(req.params.provider) ? next() : res.status(404).end()), asyncHandler(ctrl.oauthCallback));

module.exports = router;
