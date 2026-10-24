'use strict';
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(verifyToken);
router.use(tenantMiddleware);

// The company directory is for internal roles; everyone may always read their own profile.
const { requireRead } = require('../middleware/dataAccess.middleware');
const readUsers = requireRead('USERS');
const selfOrReadUsers = (req, res, next) => (Number(req.params.id) === Number(req.user?.id) ? next() : readUsers(req, res, next));
router.get('/', readUsers, userController.getAllUsers);
router.get('/:id', selfOrReadUsers, userController.getUserById);

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
