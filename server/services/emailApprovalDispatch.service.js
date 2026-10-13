'use strict';
/**
 * Phase 3 — issue a token + send the email-link approval request (SES, live).
 * Called by the DOA resolver (Phase 2) for each EXTERNAL approver in a chain.
 * Gated by EMAIL_LINK_APPROVALS at the call site.
 */
const { issueToken } = require('./emailApprovalToken.service');
const emailService = require('./notificationEmail.service');

function publicBase() {
  return (process.env.PUBLIC_APP_URL || 'https://fixtag.in').replace(/\/$/, '');
}

async function dispatchApprovalRequest({ clientId, module, documentId, approverEmail, approverName, reference, amount, vendorName, comment = null, createdBy = null, approvalLogId = null, stepId = null }, options = {}) {
  const { raw, expires_at } = await issueToken({ clientId, module, documentId, approverEmail, approverName, createdBy, approvalLogId, stepId }, options);
  const url = `${publicBase()}/api/public/approvals/${raw}`;
  const amt = amount != null ? `Rs. ${Number(amount).toLocaleString('en-IN')}` : '-';
  const html = `<div style="font-family:Arial,sans-serif;color:#1f2937">
    <p>Dear ${approverName || 'Approver'},</p>
    <p>Your approval is requested for <b>${reference || (module + ' #' + documentId)}</b>${vendorName ? ` (vendor: ${vendorName})` : ''}, amount <b>${amt}</b>.</p>
    ${comment ? `<p style="background:#f8fafc;border-left:3px solid #C55A11;padding:8px 12px;margin:8px 0;color:#374151"><b>Comment from initiator:</b><br>${String(comment).replace(/</g,'&lt;').replace(/\n/g,'<br>')}</p>` : ''}
    <p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#1F3A5F;color:#fff;text-decoration:none;border-radius:8px">Review &amp; respond</a></p>
    <p style="font-size:12px;color:#6b7280">This is a single-use link valid until ${new Date(expires_at).toDateString()}. No login required.</p>
  </div>`;
  const sent = await emailService.sendEmail({ to: approverEmail, subject: `Approval requested: ${reference || (module + ' #' + documentId)}`, html });
  return { sent, expires_at };
}

module.exports = { dispatchApprovalRequest };
