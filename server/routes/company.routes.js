'use strict';
const express = require('express');
const router = express.Router();
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const companyController = require('../controllers/company.controller');

router.use(verifyToken);
router.use(tenantMiddleware);

// Company CRUD
router.post('/', checkPermission('ADMIN', 'CREATE'), companyController.createCompany);
router.get('/', companyController.listCompanies);
router.get('/:id', companyController.getCompany);
router.put('/:id', checkPermission('ADMIN', 'EDIT'), companyController.updateCompany);
router.delete('/:id', checkPermission('ADMIN', 'DELETE'), companyController.deleteCompany);

// Company policies
router.get('/:id/policies', companyController.getCompanyPolicies);
router.put('/:id/policies', checkPermission('ADMIN', 'EDIT'), companyController.updateCompanyPolicies);

// User assignments
router.post('/:id/users', checkPermission('ADMIN', 'CREATE'), companyController.assignUserToCompany);
router.get('/:id/users', companyController.getCompanyUsers);
router.put('/:id/users/:userId', checkPermission('ADMIN', 'EDIT'), companyController.updateUserAssignment);
router.delete('/:id/users/:userId', checkPermission('ADMIN', 'DELETE'), companyController.removeUserFromCompany);

module.exports = router;
