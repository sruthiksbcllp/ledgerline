const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rfq.controller');
const { protect, requireSeniorAdmin } = require('../middleware/auth.middleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const checkPermission = require('../middleware/checkPermission');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const checkFeature = require('../middleware/featureGuard.middleware');

router.use(protect);
router.use(tenantMiddleware);
router.use(checkFeature('RFQ_MODULE'));

router.get('/', ctrl.getRfqs);
router.get('/replies/pending', requireSeniorAdmin, ctrl.pendingReplies); // before '/:id'
router.get('/:id', ctrl.getRfqById);
// Vendor replies come from the logged-in admin's own Outlook mailbox.
router.get('/:id/replies', requireSeniorAdmin, ctrl.listReplies);
router.get('/:id/replies/:messageId', requireSeniorAdmin, ctrl.getReply);
router.get('/:id/replies/:messageId/attachments/:attachmentId', requireSeniorAdmin, ctrl.getReplyAttachment);
router.post('/:id/replies/:messageId/quotation-draft', requireSeniorAdmin, ctrl.quotationDraftFromReply);
router.post('/', rbacMiddleware(['PROCUREMENT', 'FINANCE']), ctrl.createRfq);
router.post('/:id/email-preview', checkPermission('PR', 'EDIT'), ctrl.rfqEmailPreview); // review before sending
router.post('/:id/send', checkPermission('PR', 'EDIT'), ctrl.sendRfq);
router.post('/:id/vendors', checkPermission('PR', 'EDIT'), ctrl.addVendors);
router.post('/:id/vendors/:vendorId/response', checkPermission('PR', 'CREATE'), ctrl.recordResponse);
router.post('/:id/close', checkPermission('PR', 'EDIT'), ctrl.closeRfq);

module.exports = router;
