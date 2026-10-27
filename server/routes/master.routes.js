'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const masterController = require('../controllers/master.controller');
const { verifyToken, checkPermission, requireProviderAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { validate } = require('../middleware/validator.middleware');
const { categoryValidator, departmentValidator, vendorValidator, locationValidator } = require('../validators/master.validator');

const uploadRoot = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const vendorUploadDir = path.resolve(uploadRoot, 'vendor-documents');
fs.mkdirSync(vendorUploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, vendorUploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${String(file.originalname || 'vendor-document').replace(/[^a-zA-Z0-9._-]/g, '_')}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Master data routes - Secured for Multi-Tenancy
router.use(verifyToken);
router.use(tenantMiddleware);

// Reads are open to every company user. Writes need the role's permission for the section;
// lookups shared by all companies (no client_id) can only be changed by provider admins.
const SHARED_LOOKUPS = ['asset-statuses', 'asset-types', 'units', 'regions', 'property-types', 'service-providers', 'maintenance-types'];
const WRITE_ACTIONS = { POST: 'add', PUT: 'edit', PATCH: 'edit', DELETE: 'delete' };
router.use((req, res, next) => {
  const action = WRITE_ACTIONS[req.method];
  if (!action) return next();
  const resource = req.path.split('/')[1] || '';
  if (SHARED_LOOKUPS.includes(resource)) return requireProviderAdmin(req, res, next);
  const section = resource === 'vendors' ? 'VENDOR' : 'MASTER';
  return checkPermission(section, action)(req, res, next);
});

// Phase A - buying-entity dropdown (tenant-scoped read)
router.get('/entities', masterController.getEntities);
router.post('/entities', masterController.createEntity);
router.put('/entities/:id', masterController.updateEntity);
router.get('/entities/:id/gst', masterController.getEntityGst);
router.post('/entities/:id/gst', masterController.createEntityGst);
router.put('/entity-gst/:regId', masterController.updateEntityGst);
router.delete('/entity-gst/:regId', masterController.deleteEntityGst);
router.get('/', async (_req, res) => {
  return res.json({
    success: true,
    message: 'Master routes active',
    data: {
      endpoints: [
        'categories',
        'sub-categories',
        'departments',
        'sub-departments',
        'asset-statuses',
        'asset-types',
        'vendors',
        'units',
        'properties',
        'locations',
        'maintenance-types',
        'regions',
        'service-providers',
        'property-types'
      ]
    }
  });
});
router.get('/categories', masterController.getAllCategories);
router.get('/categories/depreciation-gaps', masterController.getDepreciationGaps);
router.get('/categories/:id', masterController.getCategoryById);
router.post('/categories', categoryValidator, validate, masterController.createCategory);
router.put('/categories/:id', categoryValidator, validate, masterController.updateCategory);
router.delete('/categories/:id', masterController.deleteCategory);

router.get('/sub-categories', masterController.getAllSubCategories);
router.get('/sub-categories/:id', masterController.getSubCategoryById);
router.post('/sub-categories', masterController.createSubCategory);
router.put('/sub-categories/:id', masterController.updateSubCategory);
router.delete('/sub-categories/:id', masterController.deleteSubCategory);

router.get('/departments', masterController.getAllDepartments);
router.get('/departments/:id', masterController.getDepartmentById);
router.post('/departments', departmentValidator, validate, masterController.createDepartment);
router.put('/departments/:id', departmentValidator, validate, masterController.updateDepartment);
router.delete('/departments/:id', masterController.deleteDepartment);

router.get('/sub-departments', masterController.getAllSubDepartments);
router.get('/sub-departments/:id', masterController.getSubDepartmentById);
router.post('/sub-departments', masterController.createSubDepartment);
router.put('/sub-departments/:id', masterController.updateSubDepartment);
router.delete('/sub-departments/:id', masterController.deleteSubDepartment);

router.get('/asset-statuses', masterController.getAllAssetStatuses);
router.get('/asset-statuses/:id', masterController.getAssetStatusById);
router.post('/asset-statuses', masterController.createAssetStatus);
router.put('/asset-statuses/:id', masterController.updateAssetStatus);
router.delete('/asset-statuses/:id', masterController.deleteAssetStatus);

router.get('/asset-types', masterController.getAllAssetTypes);
router.get('/asset-types/:id', masterController.getAssetTypeById);
router.post('/asset-types', masterController.createAssetType);
router.put('/asset-types/:id', masterController.updateAssetType);
router.delete('/asset-types/:id', masterController.deleteAssetType);

// AI auto-fill for the vendor form: reads an uploaded image/PDF in memory (never stored)
// and returns suggested field values. Covered by the VENDOR:add guard above.
const { extractVendorDetails, ExtractionError } = require('../services/vendorExtraction.service');
const { aiDocumentUpload } = require('../middleware/aiDocumentUpload');
router.post('/vendors/extract', aiDocumentUpload, async (req, res) => {
  try {
    const data = await extractVendorDetails(req.file);
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof ExtractionError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    console.error('[vendor-extract] unexpected error:', error.message);
    return res.status(500).json({ success: false, code: 'EXTRACTION_FAILED', message: 'AI auto-fill failed. Fill the form manually.' });
  }
});

// Vendor data by role (config/dataAccess.js). A vendor's own login only reaches its own vendor
// record (the list is narrowed in the controller); company-wide vendor dashboards are not for it.
{
  const { requireRead, vendorIdOf } = require('../middleware/dataAccess.middleware');
  const { readScope } = require('../config/dataAccess');
  router.use('/vendors', requireRead('VENDOR'), async (req, res, next) => {
    if (readScope(req.user?.role, 'VENDOR') !== 'vendor') return next();
    if (req.path === '/' || req.path === '') return next();
    const m = req.path.match(/^\/(\d+)(\/.*)?$/);
    if (m && Number(m[1]) === Number(await vendorIdOf(req))) return next();
    return res.status(403).json({ success: false, code: 'NO_DATA_ACCESS', message: 'Your role does not have access to this information.' });
  });
}
router.get('/vendors', masterController.getAllVendors);
router.get('/vendors/compliance-dashboard', masterController.getVendorComplianceDashboard);
router.get('/vendors/risk-insights', masterController.getVendorRiskInsights);
router.get('/vendors/compliance-snapshot', masterController.getVendorComplianceSnapshot);
router.post('/vendors/compliance-snapshot/year-end', masterController.createVendorComplianceYearEndSnapshot);
router.get('/vendors/compliance-snapshot/year-end/history', masterController.getVendorComplianceYearEndSnapshots);
router.post('/vendors/compliance-reminders', masterController.generateVendorComplianceReminders);
router.get('/vendors/change-requests', masterController.getVendorChangeRequests);
router.put('/vendors/change-requests/:requestId/decision', masterController.decideVendorChangeRequest);
router.get('/vendors/:id/documents', masterController.getVendorDocuments);
router.post('/vendors/:id/documents', upload.single('document'), masterController.uploadVendorDocument);
router.get('/vendors/:id/risk-history', masterController.getVendorRiskHistory);
router.get('/vendors/:id/change-requests', masterController.getVendorChangeRequests);
router.get('/vendors/:id', masterController.getVendorById);
router.get('/vendors/:id/assets', masterController.getVendorAssets);
router.put('/vendors/:id/verification', masterController.verifyVendor); // Compliance Team approval of vendor-submitted details
router.put('/vendors/:id/assets', masterController.updateVendorAssets);
router.post('/vendors', vendorValidator, validate, masterController.createVendor);
router.put('/vendors/:id', vendorValidator, validate, masterController.updateVendor);
router.delete('/vendors/:id', masterController.deleteVendor);

router.get('/units', masterController.getAllUnits);
router.get('/units/:id', masterController.getUnitById);
router.post('/units', masterController.createUnit);
router.put('/units/:id', masterController.updateUnit);
router.delete('/units/:id', masterController.deleteUnit);

router.get('/properties', masterController.getAllProperties);
router.get('/properties/:id', masterController.getPropertyById);
router.post('/properties', masterController.createProperty);
router.put('/properties/:id', masterController.updateProperty);
router.delete('/properties/:id', masterController.deleteProperty);

router.get('/roles', masterController.getAllRoles);

router.get('/locations', masterController.getAllLocations);
router.get('/locations/:id', masterController.getLocationById);
router.post('/locations', locationValidator, validate, masterController.createLocation);
router.put('/locations/:id', locationValidator, validate, masterController.updateLocation);
router.delete('/locations/:id', masterController.deleteLocation);

router.get('/maintenance-types', masterController.getAllMaintenanceTypes);
router.get('/maintenance-types/:id', masterController.getMaintenanceTypeById);
router.post('/maintenance-types', masterController.createMaintenanceType);
router.put('/maintenance-types/:id', masterController.updateMaintenanceType);
router.delete('/maintenance-types/:id', masterController.deleteMaintenanceType);

router.get('/regions', masterController.getAllRegions);
router.get('/regions/:id', masterController.getRegionById);
router.post('/regions', masterController.createRegion);
router.put('/regions/:id', masterController.updateRegion);
router.delete('/regions/:id', masterController.deleteRegion);

router.get('/service-providers', masterController.getAllServiceProviders);
router.get('/service-providers/:id', masterController.getServiceProviderById);
router.post('/service-providers', masterController.createServiceProvider);
router.put('/service-providers/:id', masterController.updateServiceProvider);
router.delete('/service-providers/:id', masterController.deleteServiceProvider);

router.get('/property-types', masterController.getAllPropertyTypes);
router.get('/property-types/:id', masterController.getPropertyTypeById);
router.post('/property-types', masterController.createPropertyType);
router.put('/property-types/:id', masterController.updatePropertyType);
router.delete('/property-types/:id', masterController.deletePropertyType);

module.exports = router;
