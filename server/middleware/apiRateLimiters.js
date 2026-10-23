'use strict';
/**
 * Centralised API rate limiters.
 *
 * Architecture (approved 2026-07-07):
 *  - Public / unauthenticated endpoints (login, register, forgot/reset password) are
 *    IP-keyed via authLimiter in index.js (brute-force protection).
 *  - Authenticated API traffic is throttled per VERIFIED user id. `userApiLimiter` is
 *    applied INSIDE verifyToken (after jwt.verify sets req.user), so identity is proven
 *    before we bucket. We NEVER decode an unverified token to derive identity.
 *  - Bulk import/export endpoints get a stricter per-user limiter (bulkUserLimiter),
 *    applied after verifyToken in the bulk route files.
 *
 * Keying authenticated limits by user (not IP) means many staff behind one office IP
 * no longer share a single bucket.
 */
const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const getClientIp = (req) => {
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp.trim();
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0].trim();
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
};

const isLoopbackRequest = (req) => {
  const ip = getClientIp(req);
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(ip);
};

// Bucket by the VERIFIED user id set by verifyToken. Falls back to IP only when there
// is no verified user (should not occur on authenticated routes; safe default).
const verifiedUserKey = (prefix) => (req) =>
  (req.user && req.user.id != null) ? `${prefix}:${req.user.id}` : getClientIp(req);

// General authenticated API limiter — 1000 req / 15 min PER VERIFIED USER.
const userApiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, message: 'Too many requests — please slow down and try again shortly.' },
  skip: isLoopbackRequest,
  keyGenerator: verifiedUserKey('user')
});

// Bulk import/export limiter — 30 req / 15 min PER VERIFIED USER.
const bulkUserLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, message: 'Too many bulk operations — please wait a few minutes.' },
  skip: isLoopbackRequest,
  keyGenerator: verifiedUserKey('bulk')
});

// Public / unauthenticated auth endpoints (login, MFA, refresh, password reset) —
// IP-keyed brute-force protection. No verified user exists yet at these routes.
const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, message: 'Too many attempts. Please wait 15 minutes and try again.' },
  skip: isLoopbackRequest,
  keyGenerator: getClientIp
});

module.exports = { userApiLimiter, bulkUserLimiter, authLimiter, getClientIp, isLoopbackRequest };
