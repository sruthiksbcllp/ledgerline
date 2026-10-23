'use strict';
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(verifyToken);
router.use(tenantMiddleware);
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);

// Self-update: any authenticated user can update their own profile.
// Managing OTHER users (edit/create/delete/reset) is a SENIOR-ADMIN action — the plain
// 'Administrator' role is excluded (Super/Client/Provider Admin only).
router.put('/:id', (req, res, next) => {
  const requesterId = String(req.user?.id || '');
  const targetId = String(req.params.id || '');
  if (requesterId && requesterId === targetId) return next();
  return requireSeniorAdmin(req, res, next);
}, userController.updateUser);

router.use(requireSeniorAdmin);
router.post('/', userController.createUser);
router.delete('/:id', userController.deleteUser);
// Admin-triggered password reset — emails the user a reset link (tenant-scoped + audited in the controller)
router.post('/:id/reset-password', userController.adminResetPassword);

module.exports = router;
