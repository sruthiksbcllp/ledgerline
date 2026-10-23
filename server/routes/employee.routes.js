'use strict';
const express = require('express');
const router = express.Router();
const ec = require('../controllers/employee.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/', ec.getEmployees);
router.post('/', ec.createEmployee);
router.post('/import', ec.importEmployees);
router.put('/:id', ec.updateEmployee);
router.delete('/:id', ec.deleteEmployee);

module.exports = router;
