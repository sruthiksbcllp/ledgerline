'use strict';
const express = require('express');
const ctrl = require('../controllers/companyAccess.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { isCompanyAdminRole } = require('../services/companyAccess.service');

const router = express.Router();

/** Company Admins of the company this session is in (a Super Admin who entered it acts as one). */
const requireCompanyAdmin = (req, res, next) => {
  if (!req.user?.client_id) return res.status(403).json({ success: false, code: 'NO_COMPANY', message: 'Open a company first.' });
  if (!isCompanyAdminRole(req.user.role)) return res.status(403).json({ success: false, code: 'NOT_COMPANY_ADMIN', message: 'Only a Company Admin can manage company access.' });
  return next();
};

router.use(verifyToken, tenantMiddleware, requireCompanyAdmin);

router.get('/overview', asyncHandler(ctrl.overview));
router.get('/requests', asyncHandler(ctrl.listRequests));
router.post('/requests/:id/approve', asyncHandler(ctrl.approve));
router.post('/requests/:id/reject', asyncHandler(ctrl.reject));
router.get('/members', asyncHandler(ctrl.listMembers));
router.put('/members/:id/role', asyncHandler(ctrl.changeRole));
router.delete('/members/:id', asyncHandler(ctrl.revoke));
router.put('/company', asyncHandler(ctrl.renameCompany));

module.exports = router;
