'use strict';
const express = require('express');
const router = express.Router();
const ar = require('../controllers/arAutomation.controller');
const o2c = require('../controllers/arO2c.controller');
const collections = require('../controllers/arCollections.controller');
const creditNotes = require('../controllers/arCreditNotes.controller');
const creditLoss = require('../controllers/arCreditLoss.controller');
const close = require('../controllers/arClose.controller');
const { arEvidenceUpload } = require('../middleware/arEvidenceUpload');
const { hasPermission } = require('../utils/permission');
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { blockWhenFinancialYearClosed } = require('../middleware/financialLock.middleware');
const { aiDocumentUpload } = require('../middleware/aiDocumentUpload');
const asyncHandler = require('../utils/asyncHandler');

// Accounts Receivable, order to cash: customers, quotations and sales orders with a credit check,
// deliveries, customer invoices, cash application, collections and journals. Each step has its own
// permission section (config/rbac.js), so each login gets the step that mirrors its AP job:
//   AR_CUSTOMER (step 1) · AR_ORDER (steps 2-3) · AR_DELIVERY (step 4, Warehouse) · AR (steps 5-9).
// A Requester raises quotations and sees only their own (config/dataAccess.js), as with requisitions.
// Verifying a customer and releasing a credit hold are open to anyone who can view that step; the
// controller then checks the person's approval limit, as bill approval does.
router.use(verifyToken);
router.use(tenantMiddleware);

const view = checkPermission('AR', 'view');
const add = checkPermission('AR', 'add');
const change = checkPermission('AR', 'edit');
const customerView = checkPermission('AR_CUSTOMER', 'view');
const customerAdd = checkPermission('AR_CUSTOMER', 'add');
const customerChange = checkPermission('AR_CUSTOMER', 'edit');
const orderView = checkPermission('AR_ORDER', 'view');
const orderAdd = checkPermission('AR_ORDER', 'add');
const orderChange = checkPermission('AR_ORDER', 'edit');
const deliveryView = checkPermission('AR_DELIVERY', 'view');
const deliveryAdd = checkPermission('AR_DELIVERY', 'add');
const deliveryChange = checkPermission('AR_DELIVERY', 'edit');
const locked = blockWhenFinancialYearClosed;
/** Passes when the user holds any one of the given section / action pairs. */
const anyOf = (...pairs) => async (req, res, next) => {
  for (const [section, action] of pairs) if (await hasPermission(req.user, section, action)) return next();
  return res.status(403).json({ success: false, message: `Access denied to ${pairs.map((p) => p.join(':')).join(' or ')}` });
};
// Approvers (Manager / Finance / Director) decide within their limit; the controller checks the limit
// and that the person deciding did not raise the item.
const approver = checkPermission('AR_APPROVE', 'view');
const viewOrApprove = anyOf(['AR', 'view'], ['AR_APPROVE', 'view']);
const raiseOrApprove = anyOf(['AR', 'add'], ['AR_APPROVE', 'view']);

// 1. Customer onboarding
router.get('/customers', customerView, asyncHandler(o2c.listCustomers));
router.post('/customers', customerAdd, asyncHandler(o2c.createCustomer));
router.put('/customers/:id', customerChange, asyncHandler(o2c.updateCustomer));
router.get('/customers/:id/credit', customerView, asyncHandler(o2c.customerCredit));
router.post('/customers/:id/verify', customerView, asyncHandler(o2c.verifyCustomer));
router.post('/customers/:id/hold', customerChange, asyncHandler(o2c.holdCustomer));

// 2-3. Quotation / sales order and credit check
router.get('/orders', orderView, asyncHandler(o2c.listOrders));
router.post('/orders/extract', orderAdd, aiDocumentUpload, asyncHandler(o2c.extractOrder));
router.post('/orders', orderAdd, asyncHandler(o2c.createOrder));
router.get('/orders/:id', orderView, asyncHandler(o2c.getOrder));
router.put('/orders/:id', orderChange, asyncHandler(o2c.updateOrder));
router.post('/orders/:id/confirm', orderChange, asyncHandler(o2c.confirmOrder));
router.post('/orders/:id/release', orderView, asyncHandler(o2c.releaseOrder));
// A Requester (AR_ORDER add) may cancel a quotation they raised; the controller checks the rest.
router.post('/orders/:id/cancel', orderAdd, asyncHandler(o2c.cancelOrder));

// 4. Delivery, and 5. the invoice raised from it
router.get('/deliveries', deliveryView, asyncHandler(o2c.listDeliveries));
router.post('/orders/:id/deliveries', deliveryAdd, asyncHandler(o2c.createDelivery));
router.post('/deliveries/:id/confirm', deliveryChange, asyncHandler(o2c.confirmDelivery));
router.post('/deliveries/:id/cancel', deliveryChange, asyncHandler(o2c.cancelDelivery));
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
router.put('/invoices/:id/einvoice', change, asyncHandler(ar.updateEinvoice));

// 7. Early-payment discount window, and unapplied cash (payments not yet matched to an invoice)
router.get('/receipts/discounts', view, asyncHandler(collections.discountOptions));
router.get('/unapplied', view, asyncHandler(collections.listUnapplied));
router.post('/unapplied/:id/apply', add, locked, asyncHandler(collections.applyUnapplied));

// Disputes and credit notes (blueprint step 5): AR raises, an approver within limit decides
router.get('/credit-notes/reasons', viewOrApprove, asyncHandler(creditNotes.reasons));
router.get('/credit-notes', viewOrApprove, asyncHandler(creditNotes.list));
router.get('/credit-notes/:id', viewOrApprove, asyncHandler(creditNotes.detail));
router.post('/invoices/:id/credit-notes', add, arEvidenceUpload, asyncHandler(creditNotes.create));
router.post('/credit-notes/:id/approve', approver, locked, asyncHandler(creditNotes.approve));
router.post('/credit-notes/:id/reject', raiseOrApprove, asyncHandler(creditNotes.reject));

// Credit-loss provision (step 8) and write-offs (step 9)
router.get('/settings', viewOrApprove, asyncHandler(creditLoss.getSettings));
router.put('/settings', approver, asyncHandler(creditLoss.saveSettings));
router.get('/ecl/preview', viewOrApprove, asyncHandler(creditLoss.eclPreview));
router.get('/ecl/runs', viewOrApprove, asyncHandler(creditLoss.listRuns));
router.post('/ecl/runs', add, asyncHandler(creditLoss.createRun));
router.post('/ecl/runs/:id/approve', approver, asyncHandler(creditLoss.approveRun));
router.post('/ecl/runs/:id/reject', approver, asyncHandler(creditLoss.rejectRun));
router.get('/write-offs', viewOrApprove, asyncHandler(creditLoss.listWriteOffs));
router.get('/write-offs/:id', viewOrApprove, asyncHandler(creditLoss.writeOffDetail));
router.post('/invoices/:id/write-offs', add, arEvidenceUpload, asyncHandler(creditLoss.createWriteOff));
router.post('/write-offs/:id/approve', approver, asyncHandler(creditLoss.approveWriteOff));
router.post('/write-offs/:id/reject', raiseOrApprove, asyncHandler(creditLoss.rejectWriteOff));
router.post('/write-offs/:id/recover', change, asyncHandler(creditLoss.recoverWriteOff));

// AR close and reporting (step 10): checklist, two-level sign-off, statements, GST register, KPIs
router.get('/tasks', asyncHandler(close.tasks));
router.get('/close', viewOrApprove, asyncHandler(close.getClose));
router.post('/close/:period/close', change, asyncHandler(close.closePeriod));
router.post('/close/:period/sign-off', approver, asyncHandler(close.signOff));
router.post('/close/:period/reopen', approver, asyncHandler(close.reopen));
router.get('/kpis', viewOrApprove, asyncHandler(close.kpis));
router.get('/customers/:id/statement', view, asyncHandler(close.statement));
router.get('/statements', view, asyncHandler(close.listStatements));
router.post('/statements/send', change, asyncHandler(close.sendStatements));
router.post('/statements/:id/response', change, asyncHandler(close.statementResponse));
router.get('/gst/sales-register', view, asyncHandler(close.gstRegister));

module.exports = router;
