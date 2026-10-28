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
const { requireRead } = require('../middleware/dataAccess.middleware');

router.get('/', requireRead('RFQ'), ctrl.getRfqs);
router.get('/replies/pending', requireSeniorAdmin, ctrl.pendingReplies); // before '/:id'
router.get('/:id', requireRead('RFQ'), ctrl.getRfqById);
// Vendor replies come from the logged-in admin's own Outlook mailbox.
router.get('/:id/replies', requireSeniorAdmin, ctrl.listReplies);
router.get('/:id/replies/:messageId', requireSeniorAdmin, ctrl.getReply);
router.get('/:id/replies/:messageId/attachments/:attachmentId', requireSeniorAdmin, ctrl.getReplyAttachment);
router.post('/:id/replies/:messageId/quotation-draft', requireSeniorAdmin, ctrl.quotationDraftFromReply);
router.post('/', rbacMiddleware(['PROCUREMENT', 'FINANCE']), ctrl.createRfq);
// Procurement runs RFQs with its RFQ permission; roles with PR rights keep the access they had.
router.post('/:id/email-preview', checkPermission.anyOf(['RFQ', 'PR'], 'EDIT'), ctrl.rfqEmailPreview); // review before sending
router.post('/:id/send', checkPermission.anyOf(['RFQ', 'PR'], 'EDIT'), ctrl.sendRfq);
router.post('/:id/vendors', checkPermission.anyOf(['RFQ', 'PR'], 'EDIT'), ctrl.addVendors);
router.post('/:id/vendors/:vendorId/response', checkPermission.anyOf(['RFQ', 'PR'], 'CREATE'), ctrl.recordResponse);
router.post('/:id/close', checkPermission.anyOf(['RFQ', 'PR'], 'EDIT'), ctrl.closeRfq);

module.exports = router;
