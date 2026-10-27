'use strict';
const express = require('express');
const router = express.Router();
const ses = require('../controllers/serviceEntrySheet.controller');
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { requireRead } = require('../middleware/dataAccess.middleware');
const { blockWhenFinancialYearClosed } = require('../middleware/financialLock.middleware');

// Service Entry Sheets (service receipts against POs). Who may confirm / review / approve is
// decided per SES in the controller (stage roles, segregation of duties, approval limit).
router.use(verifyToken);
router.use(tenantMiddleware);

// Must be before /:id so 'purchase-orders' is not taken as an id
router.get('/purchase-orders', requireRead('SES'), ses.getOpenPurchaseOrders);
router.get('/', requireRead('SES'), ses.getServiceEntrySheets);
router.get('/:id', requireRead('SES'), ses.getServiceEntrySheet);
router.post('/', requireRead('SES'), checkPermission('SES', 'add'), blockWhenFinancialYearClosed, ses.createServiceEntrySheet);
router.post('/:id/confirm', requireRead('SES'), ses.confirmServiceEntrySheet);
router.post('/:id/review', requireRead('SES'), ses.reviewServiceEntrySheet);
router.post('/:id/approve', requireRead('SES'), blockWhenFinancialYearClosed, ses.approveServiceEntrySheet);
router.post('/:id/reject', requireRead('SES'), ses.rejectServiceEntrySheet);

// Vendor invoice file for an SES (PDF/JPG/PNG, 10 MB) - stored with the other invoice documents.
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const invoiceDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'), 'invoices');
if (!fs.existsSync(invoiceDir)) fs.mkdirSync(invoiceDir, { recursive: true });
const invoiceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, invoiceDir),
    filename: (_req, file, cb) => cb(null, `ses-inv-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname || '').toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype) ? cb(null, true) : cb(new Error('Only PDF/JPG/PNG files are allowed')))
});
router.post('/:id/invoice-document', requireRead('SES'), blockWhenFinancialYearClosed, (req, res, next) => invoiceUpload.single('file')(req, res, (err) => {
  if (!err) return next();
  return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'File size must be 10MB or less' : (err.message || 'Invalid file upload') });
}), ses.uploadInvoiceDocument);

module.exports = router;
