const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superadmin.controller');
const integrationController = require('../controllers/integration.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

// Super Admin Routes
router.get('/entities', authorize('SUPER_ADMIN'), superAdminController.getAllEntities);
router.post('/entities', authorize('SUPER_ADMIN'), superAdminController.createEntity);
router.put('/entities/:id', authorize('SUPER_ADMIN'), superAdminController.updateEntityStatus);

// Integration Routes (Client Admin)
router.get('/api-keys', authorize('ADMIN', 'SUPER_ADMIN'), integrationController.getKeys);
router.post('/api-keys', authorize('ADMIN', 'SUPER_ADMIN'), integrationController.generateApiKey);
router.delete('/api-keys/:id', authorize('ADMIN', 'SUPER_ADMIN'), integrationController.revokeKey);

module.exports = router;
