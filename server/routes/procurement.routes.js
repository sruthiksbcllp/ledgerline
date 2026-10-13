const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const procurementController = require('../controllers/procurement.controller');
const poPrintController = require('../controllers/poPrint.controller');
const masterController = require('../controllers/master.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const { blockWhenFinancialYearClosed } = require('../middleware/financialLock.middleware');
const checkPermission = require('../middleware/checkPermission');
const checkFeature = require('../middleware/featureGuard.middleware');
const asyncHandler = require('../utils/asyncHandler');

const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const activityLog = require('../middleware/activityLog.middleware');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'invoices');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `inv-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF/JPG/PNG files are allowed'));
    }
    return cb(null, true);
  }
});

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype);
    return ok ? cb(null, true) : cb(new Error('Only PNG/JPG logos are allowed'));
  }
});

router.use(protect);
router.use(tenantMiddleware);
router.use(checkFeature('PROCUREMENT_MODULE'));

// Asset-Vendor lookup for PR form
router.get('/asset-vendors/:assetId', asyncHandler(procurementController.getVendorsForAsset));

// PR Routes
router.get('/pr', activityLog('PROCUREMENT', 'MODULE'), asyncHandler(procurementController.getPRs));
router.get('/pr/:id', asyncHandler(procurementController.getPRById));
router.get('/pr/:id/history', asyncHandler(procurementController.getPRApprovalHistory));
router.post('/pr', checkPermission('PR', 'CREATE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.createPR));
router.put('/pr/:id', checkPermission('PR', 'EDIT'), blockWhenFinancialYearClosed, asyncHandler(procurementController.updatePR));
router.put('/pr/:id/approve', checkPermission('PR', 'APPROVE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.approvePR));
router.put('/pr/:id/reject', checkPermission('PR', 'APPROVE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.rejectPR));
router.delete('/pr/:id', checkPermission('PR', 'DELETE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.deletePR));

// Quotation Routes
router.get('/quotations', asyncHandler(procurementController.getQuotations));
router.get('/quotations/compare', asyncHandler(procurementController.getQuotationComparison));
router.get('/quotations/:id', asyncHandler(procurementController.getQuotationById));
router.post('/quotations', checkPermission('PR', 'CREATE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.createQuotation));
router.put('/quotations/:id/status', checkPermission('PR', 'EDIT'), blockWhenFinancialYearClosed, asyncHandler(procurementController.updateQuotationStatus));
router.put('/quotations/:id/approve', checkPermission('PR', 'EDIT'), blockWhenFinancialYearClosed, asyncHandler(procurementController.approveQuotation));
router.put('/quotations/:id/reject', checkPermission('PR', 'EDIT'), blockWhenFinancialYearClosed, asyncHandler(procurementController.rejectQuotation));

// PO Routes
router.get('/po', activityLog('PROCUREMENT', 'MODULE'), asyncHandler(procurementController.getPOs));
router.get('/po/:id', asyncHandler(procurementController.getPOById));
router.get('/po/:id/approval-status', asyncHandler(procurementController.getPoApprovalStatus)); // Phase 1 #9
router.post('/po', checkPermission('PR', 'CREATE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.createPO));
// FIX: Added PUT (amend) and DELETE (cancel) — POs were permanently immutable once issued
router.put('/po/:id', checkPermission('PR', 'EDIT'), blockWhenFinancialYearClosed, asyncHandler(procurementController.updatePO));
// CFG-01 — PO print (PDF) + per-client print settings
router.get('/po/:id/print', asyncHandler(poPrintController.printPo));
router.post('/po/:id/send-to-vendor', checkPermission('PR', 'EDIT'), asyncHandler(procurementController.sendPoToVendor)); // CFG-02
router.put('/po/:id/change-vendor', checkPermission('PR', 'EDIT'), asyncHandler(procurementController.changePoVendor)); // Phase 4a #14/#15
router.get('/po-print-config', asyncHandler(poPrintController.getConfig));
router.put('/po-print-config', asyncHandler(poPrintController.upsertConfig));
router.post('/po-print-config/logo', logoUpload.single('logo'), asyncHandler(poPrintController.uploadLogo));
router.get('/po-print-config/logo', asyncHandler(poPrintController.getLogo));
// Phase 4b: per-department PO Terms & Conditions defaults
router.get('/po-terms-defaults', asyncHandler(poPrintController.getTermsDefaults));
router.post('/po-terms-defaults', asyncHandler(poPrintController.saveTermsDefault));
router.delete('/po-terms-defaults/:id', asyncHandler(poPrintController.deleteTermsDefault));
router.delete('/po/:id', checkPermission('PR', 'APPROVE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.cancelPO));

// GRN Routes
router.get('/grn/purchase-orders', asyncHandler(procurementController.getApprovedPOsForGRN));
router.get('/grn', asyncHandler(procurementController.getGRNs));
router.post('/grn', checkPermission('PR', 'CREATE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.createGRN));

// Gate Entry / Quality Governance Routes
router.get('/gate-entries', asyncHandler(procurementController.getGateEntries));
router.post('/gate-entries', checkPermission('PR', 'CREATE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.createGateEntry));
router.delete('/gate-entries/:id', checkPermission('PR', 'DELETE'), asyncHandler(procurementController.deleteGateEntry));
router.get('/vendor-debit-notes', asyncHandler(procurementController.getVendorDebitNotes));

// Invoice Routes
router.get('/invoices', activityLog('PROCUREMENT', 'MODULE'), asyncHandler(procurementController.getInvoices));
router.post('/invoices', checkPermission('PR', 'CREATE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.createInvoice));
router.post(
  '/invoices/:id/upload',
  checkPermission('PR', 'EDIT'),
  blockWhenFinancialYearClosed,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File size must be 10MB or less' });
      }
      return res.status(400).json({ success: false, message: err.message || 'Invalid file upload' });
    });
  },
  asyncHandler(procurementController.uploadInvoiceDocument)
);
// FIX: Added GET /invoices/:id — was missing, making resolve-exception and mark-paid unusable without detail view
router.get('/invoices/:id', asyncHandler(procurementController.getInvoiceById));
router.put('/invoices/:id', checkPermission('PR', 'EDIT'), blockWhenFinancialYearClosed, asyncHandler(procurementController.updateInvoice));
router.put('/invoices/:id/resolve-exception', checkPermission('PR', 'APPROVE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.resolveInvoiceException));
router.put('/invoices/:id/approve-for-payment', checkPermission('PR', 'APPROVE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.approveInvoiceForPayment));
router.put('/invoices/:id/record-external-payment', checkPermission('PR', 'APPROVE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.recordExternalPayment));
router.put('/invoices/:id/mark-paid', checkPermission('PR', 'APPROVE'), blockWhenFinancialYearClosed, asyncHandler(procurementController.markInvoicePaid));

// Compatibility aliases for older frontend bundles
router.get('/vendors', asyncHandler(masterController.getAllVendors));
router.get('/reports', asyncHandler(procurementController.getPRs));

module.exports = router;
