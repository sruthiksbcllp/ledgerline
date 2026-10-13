'use strict';
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');
const { verifyToken, checkPermission, requireSeniorAdmin } = require('../middleware/auth.middleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

router.get('/', verifyToken, roleController.getAllRoles);
router.get('/:id', verifyToken, roleController.getRoleById);
// Role management is Super-Admin-only (plain 'Administrator' excluded).
router.post('/', verifyToken, requireSeniorAdmin, checkPermission('Roles & Permissions', 'add'), roleController.createRole);
router.put('/:id', verifyToken, requireSeniorAdmin, checkPermission('Roles & Permissions', 'edit'), roleController.updateRole);
router.delete('/:id', verifyToken, requireSeniorAdmin, checkPermission('Roles & Permissions', 'delete'), roleController.deleteRole);

module.exports = router;
