'use strict';
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');
const { verifyToken, checkPermission, requireProviderAdmin } = require('../middleware/auth.middleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

router.get('/', verifyToken, roleController.getAllRoles);
router.get('/:id', verifyToken, roleController.getRoleById);
// Roles and their permissions are shared by every company, so only provider admins may change them.
router.post('/', verifyToken, requireProviderAdmin, checkPermission('Roles & Permissions', 'add'), roleController.createRole);
router.put('/:id', verifyToken, requireProviderAdmin, checkPermission('Roles & Permissions', 'edit'), roleController.updateRole);
router.delete('/:id', verifyToken, requireProviderAdmin, checkPermission('Roles & Permissions', 'delete'), roleController.deleteRole);

module.exports = router;
