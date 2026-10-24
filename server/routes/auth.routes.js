'use strict';
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken, requireProviderAdmin } = require('../middleware/auth.middleware');
const { requireMfaForPrivileged } = require('../middleware/mfa.middleware');
const { authLimiter } = require('../middleware/apiRateLimiters');
const asyncHandler = require('../utils/asyncHandler');

router.get('/register-roles', asyncHandler(authController.listPublicRoles));
router.get('/register-company', authLimiter, asyncHandler(authController.registerCompanyLookup));
router.post('/register', authLimiter, asyncHandler(authController.register));
router.post('/login', authLimiter, asyncHandler(authController.login));
router.post('/mfa/challenge', authLimiter, asyncHandler(authController.mfaChallenge));
router.post('/mfa/enroll/start', authLimiter, asyncHandler(authController.startMfaEnrollment));
router.post('/mfa/enroll/complete', authLimiter, asyncHandler(authController.completeMfaEnrollment));
router.post('/mfa/verify', authLimiter, asyncHandler(authController.verifyMfa));
router.post('/mfa/reset-user', verifyToken, requireMfaForPrivileged, requireProviderAdmin, asyncHandler(authController.resetUserMfaByProviderAdmin));
router.post('/logout', verifyToken, asyncHandler(authController.logout));
router.post('/change-password', verifyToken, asyncHandler(authController.changePassword));
router.post('/refresh-token', authLimiter, asyncHandler(authController.refreshToken));
router.post('/forgot-password', authLimiter, asyncHandler(authController.forgotPassword));
router.post('/reset-password', authLimiter, asyncHandler(authController.resetPassword));

// Multi-company support
router.get('/my-companies', verifyToken, asyncHandler(authController.getMyCompanies));
router.get('/current-company', verifyToken, asyncHandler(authController.getCurrentCompany));
router.post('/switch-company/:companyId', verifyToken, asyncHandler(authController.switchCompany));

// Multi-company access: pick a company after login, ask to join one on your email domain.
router.get('/workspaces', verifyToken, asyncHandler(authController.listWorkspaces));
router.post('/workspaces/:clientId/enter', verifyToken, requireMfaForPrivileged, asyncHandler(authController.enterWorkspace));
router.post('/workspaces/:clientId/request', verifyToken, authLimiter, asyncHandler(authController.requestWorkspaceAccess));
router.delete('/workspaces/:clientId/request', verifyToken, asyncHandler(authController.cancelWorkspaceRequest));

module.exports = router;
