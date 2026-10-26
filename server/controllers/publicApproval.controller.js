'use strict';
/**
 * Phase 3 — public (no-login) approval endpoint for external email-link approvers.
 * GET renders a confirm page (NO state change — safe against email-scanner prefetch);
 * POST atomically consumes the token and records the decision.
 * The token is bound to one tenant + document, so no cross-tenant data is exposed.
 */
const { validateToken, consumeToken } = require('../services/emailApprovalToken.service');
const { PurchaseOrder, Vendor } = require('../models');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f6f9;margin:0;padding:40px 16px;color:#1f2937}
.card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{font-size:18px;margin:0 0 16px;color:#1F3A5F}.row{margin:6px 0;font-size:14px}.muted{color:#6b7280}
.btns{margin-top:22px;display:flex;gap:12px}button{flex:1;padding:12px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
.ap{background:#16a34a;color:#fff}.rj{background:#dc2626;color:#fff}textarea{width:100%;box-sizing:border-box;margin-top:14px;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-family:inherit}
.note{margin-top:18px;font-size:12px;color:#6b7280}</style></head><body><div class="card">${body}</div></body></html>`;
}

async function docSummary(token) {
  if (token.module === 'PO') {
    const po = await PurchaseOrder.findOne({ where: { id: token.document_id, client_id: token.client_id }, include: [{ model: Vendor }] });
    if (po) return { ref: po.po_number || `PO #${po.id}`, amount: po.total_amount, vendor: po.Vendor && po.Vendor.vendor_name, type: po.type };
  }
  return { ref: `${token.module} #${token.document_id}`, amount: null, vendor: null };
}

// Live DOA chain status for the confirm page (who has approved so far).
async function chainStatusHtml(token) {
  try {
    if (!token.step_id) return '';
    const { DoaApprovalStep } = require('../models');
    const myStep = await DoaApprovalStep.findByPk(token.step_id);
    if (!myStep) return '';
    const steps = await DoaApprovalStep.findAll({ where: { request_id: myStep.request_id }, order: [['seq', 'ASC']] });
    if (!steps.length) return '';
    const icon = (st) => st === 'APPROVED' ? '<span style="color:#16a34a;font-weight:600">Approved &#10003;</span>'
      : st === 'REJECTED' ? '<span style="color:#dc2626;font-weight:600">Rejected &#10007;</span>'
      : '<span style="color:#9ca3af">Pending</span>';
    const label = (st) => {
      if (st.requirement_type === 'ANY_ONE_OF') {
        let names = [];
        try { names = JSON.parse(st.eligible_json || '[]').map((m) => m.approver_name || m.approver_email).filter(Boolean); } catch (e) {}
        const who = st.status === 'APPROVED' && st.decided_email ? (' &mdash; by ' + st.decided_email) : '';
        return 'Any 1 of: ' + (names.join(', ') || 'panel') + who;
      }
      return st.approver_name || st.approver_email || 'Approver';
    };
    const rows = steps.map((st) => '<div class="row" style="display:flex;justify-content:space-between;gap:12px"><span>' + esc(label(st)) + '</span>' + icon(st.status) + '</div>').join('');
    return '<div style="margin:14px 0;padding:12px;background:#f9fafb;border:1px solid #eef2f7;border-radius:8px"><div class="row" style="font-weight:600;color:#1F3A5F;margin-bottom:6px">Approval status</div>' + rows + '</div>';
  } catch (e) { return ''; }
}

exports.showConfirm = async (req, res) => {
  const v = await validateToken(req.params.token);
  if (!v.valid) {
    const msg = { MISSING: 'This link is invalid.', NOT_FOUND: 'This approval link is not recognised.', ALREADY_USED: 'This request has already been actioned.', EXPIRED: 'This approval link has expired.' }[v.reason] || 'This link is no longer valid.';
    return res.status(410).send(page('Link not valid', `<h1>Link not valid</h1><div class="row">${esc(msg)}</div>`));
  }
  const t = v.token;
  const d = await docSummary(t);
  const amt = d.amount != null ? `₹ ${Number(d.amount).toLocaleString('en-IN')}` : '—';
  const chain = await chainStatusHtml(t);
  return res.send(page('Approval request', `
    <h1>Purchase Order approval</h1>
    <div class="row"><b>Reference:</b> ${esc(d.ref)}</div>
    ${d.type ? `<div class="row"><b>Type:</b> ${esc(d.type)}</div>` : ''}
    <div class="row"><b>Vendor:</b> ${esc(d.vendor || '—')}</div>
    <div class="row"><b>Amount:</b> ${esc(amt)}</div>
    <div class="row muted">Approver: ${esc(t.approver_name || t.approver_email)}</div>
    ${chain}
    <form method="POST" action="/api/public/approvals/${esc(req.params.token)}">
      <textarea name="comment" rows="2" placeholder="Optional comment"></textarea>
      <div class="btns">
        <button class="ap" name="action" value="approve" type="submit">Approve</button>
        <button class="rj" name="action" value="reject" type="submit">Reject</button>
      </div>
    </form>
    <div class="note">This is a single-use, time-limited link. Your decision and IP are recorded for audit.</div>`));
};

async function emailApproverActor(token) {
  const email = String(token?.approver_email || '').trim().toLowerCase();
  const fallback = { user_name: token?.approver_name || email || 'Email approver', role_name: 'External Approver (email link)', source: 'EMAIL_LINK', client_id: token?.client_id };
  if (!email) return fallback;
  try {
    const { User, CompanyMembership } = require('../models');
    const user = await User.findOne({ where: { email }, attributes: ['id', 'client_id'] });
    if (!user) return fallback;
    const m = await CompanyMembership.findOne({ where: { user_id: user.id, client_id: token.client_id, status: 'ACTIVE' }, attributes: ['role_code'] });
    if (!m && Number(user.client_id) !== Number(token.client_id)) return fallback;
    return { user_id: user.id, role_code: m?.role_code || null, source: 'EMAIL_LINK', client_id: token.client_id };
  } catch (e) { return fallback; }
}

exports.submitDecision = async (req, res) => {
  const action = String((req.body && req.body.action) || '').toLowerCase();
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).send(page('Invalid', `<h1>Invalid action</h1><div class="row">Please use the Approve or Reject button.</div>`));
  }
  const decision = action === 'approve' ? 'APPROVED' : 'REJECTED';
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
  const comment = (req.body && req.body.comment) ? String(req.body.comment).slice(0, 1000) : null;
  const result = await consumeToken(req.params.token, decision, { ip, comment });
  if (!result.ok) {
    const msg = { ALREADY_USED: 'This request has already been actioned.', EXPIRED: 'This approval link has expired.', NOT_FOUND: 'This approval link is not recognised.' }[result.reason] || 'This link is no longer valid.';
    return res.status(410).send(page('Not actioned', `<h1>Not actioned</h1><div class="row">${esc(msg)}</div>`));
  }
  // Phase 2b-2: advance the DOA chain from the consumed token, and flip the PO when the
  // whole request is decided. Wrapped so a recording error never breaks the approver page.
  // The PO's activity trail names the approver: their user account and role when the email
  // belongs to someone in this company, otherwise the name on the approval link.
  const actor = await emailApproverActor(result.token);
  await require('../utils/requestContext').run({ actor, comment }, async () => {
  try {
    if (result.token && result.token.step_id) {
      const { DoaApprovalStep, DoaApprovalRequest, PurchaseOrder } = require('../models');
      const { recordStepDecision, dispatchLevel } = require('../services/doaApproval.service');
      const step = await DoaApprovalStep.findByPk(result.token.step_id);
      if (step && step.status === 'PENDING') {
        const rr = await recordStepDecision(step, decision, { byEmail: result.token.approver_email, ip, comment });
        if (rr.ok && rr.requestStatus !== 'IN_PROGRESS') {
          const reqRow = await DoaApprovalRequest.findByPk(step.request_id);
          if (reqRow && reqRow.module === 'PO') {
            const po = await PurchaseOrder.findByPk(reqRow.document_id);
            if (po && (po.status === 'IN_APPROVAL' || po.status === 'SUBMITTED')) {
              await po.update({ status: rr.requestStatus === 'APPROVED' ? 'ISSUED' : 'REJECTED', is_fully_approved: rr.requestStatus === 'APPROVED', approval_date: new Date() });
            }
          }
        } else if (rr.ok && rr.requestStatus === 'IN_PROGRESS' && rr.nextLevel) {
          // this level is fully approved -> email the next level's approver(s)
          try { await dispatchLevel(step.request_id, rr.nextLevel); } catch (e) { /* fail-open */ }
        }
      }
    }
  } catch (e) { /* recording must not break the approver confirmation page */ }
  });

  const verb = decision === 'APPROVED' ? 'approved' : 'rejected';
  return res.send(page('Recorded', `<h1>Decision recorded</h1><div class="row">You have <b>${esc(verb)}</b> this request. Thank you — you may close this window.</div>`));
};
