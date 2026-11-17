'use strict';
const express = require('express');
const router = express.Router();
const ar = require('../controllers/arAutomation.controller');
const o2c = require('../controllers/arO2c.controller');
const collections = require('../controllers/arCollections.controller');
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { blockWhenFinancialYearClosed } = require('../middleware/financialLock.middleware');
const { aiDocumentUpload } = require('../middleware/aiDocumentUpload');
const asyncHandler = require('../utils/asyncHandler');

// Accounts Receivable, order to cash (AR permission section): customers, quotations and sales orders
// with a credit check, deliveries, customer invoices, cash application, collections and journals.
// Verifying a customer and releasing a credit hold are open to anyone who can view AR; the
// controller then checks the person's approval limit, as bill approval does.
router.use(verifyToken);
router.use(tenantMiddleware);

const view = checkPermission('AR', 'view');
const add = checkPermission('AR', 'add');
const change = checkPermission('AR', 'edit');
const locked = blockWhenFinancialYearClosed;

// 1. Customer onboarding
router.get('/customers', view, asyncHandler(o2c.listCustomers));
router.post('/customers', add, asyncHandler(o2c.createCustomer));
router.put('/customers/:id', change, asyncHandler(o2c.updateCustomer));
router.get('/customers/:id/credit', view, asyncHandler(o2c.customerCredit));
router.post('/customers/:id/verify', view, asyncHandler(o2c.verifyCustomer));
router.post('/customers/:id/hold', change, asyncHandler(o2c.holdCustomer));

// 2-3. Quotation / sales order and credit check
router.get('/orders', view, asyncHandler(o2c.listOrders));
router.post('/orders/extract', add, aiDocumentUpload, asyncHandler(o2c.extractOrder));
router.post('/orders', add, asyncHandler(o2c.createOrder));
router.get('/orders/:id', view, asyncHandler(o2c.getOrder));
router.put('/orders/:id', change, asyncHandler(o2c.updateOrder));
router.post('/orders/:id/confirm', change, asyncHandler(o2c.confirmOrder));
router.post('/orders/:id/release', view, asyncHandler(o2c.releaseOrder));
router.post('/orders/:id/cancel', change, asyncHandler(o2c.cancelOrder));

// 4. Delivery, and 5. the invoice raised from it
router.get('/deliveries', view, asyncHandler(o2c.listDeliveries));
router.post('/orders/:id/deliveries', add, asyncHandler(o2c.createDelivery));
router.post('/deliveries/:id/confirm', change, asyncHandler(o2c.confirmDelivery));
router.post('/deliveries/:id/cancel', change, asyncHandler(o2c.cancelDelivery));
router.get('/deliveries/:id/invoice-preview', view, asyncHandler(o2c.invoicePreview));
router.post('/deliveries/:id/invoice', add, locked, asyncHandler(o2c.invoiceDelivery));

// 7. Cash receipt and application
router.post('/receipts/extract', add, aiDocumentUpload, asyncHandler(collections.extractRemittance));
router.post('/receipts/apply', add, locked, asyncHandler(collections.applyPayment));

// 8. Collections and ageing
router.get('/collections/worklist', view, asyncHandler(collections.worklist));
router.get('/reports/ageing', view, asyncHandler(collections.ageing));
router.post('/invoices/:id/promises', change, asyncHandler(collections.addPromise));
router.get('/invoices/:id/reminder-draft', view, asyncHandler(collections.reminderDraft));

// 6 and 9. Accounting entries and GL posting
router.get('/journals', view, asyncHandler(collections.journals));

// 5. Customer invoices recorded directly (typed, or read from a PDF by AI)
router.get('/invoices', checkPermission('AR', 'view'), asyncHandler(ar.list));
router.get('/invoices/:id', checkPermission('AR', 'view'), asyncHandler(ar.detail));
router.post('/invoices/extract', checkPermission('AR', 'add'), aiDocumentUpload, asyncHandler(ar.extract));
router.post('/invoices/validate', checkPermission('AR', 'add'), asyncHandler(ar.validate));
router.post('/invoices', checkPermission('AR', 'add'), blockWhenFinancialYearClosed, asyncHandler(ar.create));
router.post('/invoices/:id/receipts', checkPermission('AR', 'add'), blockWhenFinancialYearClosed, asyncHandler(ar.recordReceipt));
router.put('/invoices/:id/cancel', checkPermission('AR', 'edit'), blockWhenFinancialYearClosed, asyncHandler(ar.cancel));
router.post('/invoices/:id/remind', checkPermission('AR', 'edit'), asyncHandler(ar.remind));
router.post('/reminders/overdue', checkPermission('AR', 'edit'), asyncHandler(ar.remindAllOverdue));

module.exports = router;
