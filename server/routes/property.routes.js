'use strict';
const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/property.controller');
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(verifyToken);
router.use(tenantMiddleware);
router.get('/', propertyController.getAllProperties);
router.get('/:id', propertyController.getPropertyById);
router.post('/', checkPermission('Manage Properties', 'add'), propertyController.createProperty);
router.put('/:id', checkPermission('Manage Properties', 'edit'), propertyController.updateProperty);
router.delete('/:id', checkPermission('Manage Properties', 'delete'), propertyController.deleteProperty);

module.exports = router;
