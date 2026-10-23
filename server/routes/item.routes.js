const express = require('express');
const router = express.Router();
const itemController = require('../controllers/item.controller');
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(tenantMiddleware);
router.get('/', verifyToken, itemController.getAllItems);
router.get('/assets', verifyToken, itemController.getAssetItems);

router.get('/:id', verifyToken, itemController.getItemById);
router.post('/', verifyToken, checkPermission('Asset Management', 'add'), itemController.createItem);
router.put('/:id', verifyToken, checkPermission('Asset Management', 'edit'), itemController.updateItem);
router.delete('/:id', verifyToken, checkPermission('Asset Management', 'delete'), itemController.deleteItem);

module.exports = router;
