'use strict';
// Phase 3 — PUBLIC (no verifyToken) email-link approval routes. Mounted OUTSIDE auth.
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ctrl = require('../controllers/publicApproval.controller');

// Dedicated throttle (defense-in-depth; tokens are 256-bit so brute force is infeasible).
const linkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

router.get('/:token', linkLimiter, ctrl.showConfirm);
router.post('/:token', linkLimiter, express.urlencoded({ extended: false }), ctrl.submitDecision);

module.exports = router;
