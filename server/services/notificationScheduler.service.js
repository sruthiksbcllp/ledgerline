'use strict';

const { Op } = require('sequelize');
const { AssetMaintenance, AssetInsurance, Warranty, AssetAmc, Vendor, Asset, User, Client, NotificationLog, PurchaseRequisition, PurchaseOrder, ApprovalMatrix, Role } = require('../models');
const notificationEmailService = require('./notificationEmail.service');

class NotificationSchedulerService {
  async runDailyNotifications() {
    try {
      // Client has no 'status' field — fetch all clients
      const clients = await Client.findAll({ attributes: ['id'] });

      for (const client of clients) {
        try {
          await this.processClientNotifications(client);
        } catch { /* skip failed client, continue with next */ }
      }
    } catch { /* non-fatal scheduler error */ }
  }

  async processClientNotifications(client) {
    const clientId = client.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Per-tenant recipient selection (opt-in): notifications go ONLY to users explicitly
    // flagged receive_notifications=true. If a tenant has selected none, NO email is sent.
    const recipients = await User.findAll({
      where: { client_id: clientId, status: 'ACTIVE', receive_notifications: true },
      attributes: ['id', 'email', 'first_name', 'last_name']
    });

    const adminEmails = recipients.map((u) => u.email).filter(Boolean);
    if (adminEmails.length === 0) return; // no recipients configured -> send to nobody

    await this.checkOverdueMaintenance(clientId, adminEmails, today);
    await this.checkExpiringInsurance(clientId, adminEmails, today);
    await this.checkExpiringWarranty(clientId, adminEmails, today);
    await this.checkExpiringAMC(clientId, adminEmails, today);
    await this.checkPendingApprovals(clientId, adminEmails, today);
  }

  async checkOverdueMaintenance(clientId, adminEmails, today) {
    const overdueRecords = await AssetMaintenance.findAll({
      where: { status: 'SCHEDULED', scheduled_date: { [Op.lt]: today } },
      include: [{ model: Asset, attributes: ['id', 'asset_name', 'asset_code', 'client_id'], where: { client_id: clientId }, required: true }]
    });

    if (overdueRecords.length === 0) return;

    const todayStr = today.toLocaleDateString('en-IN');
    const subject = `[Fixtag] Overdue Maintenance Alert — ${todayStr}`;
    await this.sendDigestEmail(adminEmails, subject, this.maintenanceHtml(overdueRecords), clientId, 'MAINTENANCE', overdueRecords[0].id);
  }

  async checkExpiringInsurance(clientId, adminEmails, today) {
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const records = await AssetInsurance.findAll({
      where: { status: 'ACTIVE', client_id: clientId, expiry_date: { [Op.between]: [today, in30Days] } },
      include: [{ model: Asset, as: 'asset', attributes: ['id', 'asset_name', 'asset_code'], required: true }]
    });

    if (records.length === 0) return;

    const todayStr = today.toLocaleDateString('en-IN');
    const subject = `[Fixtag] Expiring Insurance Alert — ${todayStr}`;
    await this.sendDigestEmail(adminEmails, subject, this.insuranceHtml(records), clientId, 'INSURANCE', records[0].id);
  }

  async checkExpiringWarranty(clientId, adminEmails, today) {
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const records = await Warranty.findAll({
      where: { end_date: { [Op.between]: [today, in30Days] } },
      include: [{ model: Asset, attributes: ['id', 'asset_name', 'asset_code', 'client_id'], where: { client_id: clientId }, required: true }]
    });

    if (records.length === 0) return;

    const todayStr = today.toLocaleDateString('en-IN');
    const subject = `[Fixtag] Expiring Warranty Alert — ${todayStr}`;
    await this.sendDigestEmail(adminEmails, subject, this.warrantyHtml(records), clientId, 'WARRANTY', records[0].id);
  }

  async checkExpiringAMC(clientId, adminEmails, today) {
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const records = await AssetAmc.findAll({
      where: { status: 'ACTIVE', client_id: clientId, end_date: { [Op.between]: [today, in30Days] } },
      include: [
        { model: Asset, as: 'asset', attributes: ['id', 'asset_name', 'asset_code'], required: false },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'], required: false }
      ]
    });

    if (records.length === 0) return;

    const todayStr = today.toLocaleDateString('en-IN');
    const subject = `[Fixtag] Expiring AMC Alert — ${todayStr}`;
    await this.sendDigestEmail(adminEmails, subject, this.amcHtml(records), clientId, 'AMC', records[0].id);
  }

  // FG-12 — overdue PR/PO approval reminders + escalation (notify-only; no change to approval flow)
  async checkPendingApprovals(clientId, adminEmails, today) {
    const REMIND_DAYS = Number(process.env.APPROVAL_REMIND_DAYS || 2);
    const ESCALATE_DAYS = Number(process.env.APPROVAL_ESCALATE_DAYS || 5);
    const PENDING = ['IN_APPROVAL', 'SUBMITTED', 'PENDING_APPROVAL'];
    const now = Date.now();
    const ageDays = (r) => Math.floor((now - new Date(r.updatedAt || r.createdAt || now).getTime()) / 86400000);

    const prs = await PurchaseRequisition.findAll({ where: { client_id: clientId, is_fully_approved: false, status: { [Op.in]: PENDING } } });
    const pos = await PurchaseOrder.findAll({ where: { client_id: clientId, is_fully_approved: false, status: { [Op.in]: PENDING } } });

    const docs = [
      ...prs.map((r) => ({ type: 'PR', id: r.id, number: r.pr_number, amount: Number(r.total_cost || 0), level: r.current_level || r.current_approval_level || 1, workflow_id: r.workflow_id, age: ageDays(r) })),
      ...pos.map((r) => ({ type: 'PO', id: r.id, number: r.po_number, amount: Number(r.total_amount || 0), level: r.current_level || r.current_approval_level || 1, workflow_id: r.workflow_id, age: ageDays(r) })),
    ].filter((d) => d.age >= REMIND_DAYS);
    if (docs.length === 0) return;

    // resolve current-level role per doc (matrix cache)
    const matrixCache = {};
    const matrixFor = async (wfId) => {
      if (wfId == null) return [];
      if (!matrixCache[wfId]) matrixCache[wfId] = await ApprovalMatrix.findAll({ where: { workflow_id: wfId, is_active: true } });
      return matrixCache[wfId];
    };
    for (const d of docs) {
      const rows = await matrixFor(d.workflow_id);
      const rule = rows.find((m) => m.level === d.level) || rows[0];
      d.role_code = rule ? String(rule.role_code || '').toUpperCase() : null;
    }

    // role -> active approver emails (tenant-scoped) cache
    const emailCache = {};
    const resolveRoleEmails = async (roleCode) => {
      if (!roleCode) return [];
      if (emailCache[roleCode] === undefined) {
        const users = await User.findAll({
          where: { client_id: clientId, status: 'ACTIVE' },
          include: [{ model: Role, as: 'Role', attributes: ['code'], where: { code: roleCode }, required: true }],
          attributes: ['id', 'email'],
        });
        emailCache[roleCode] = users.map((u) => u.email).filter(Boolean);
      }
      return emailCache[roleCode];
    };

    const todayStr = today.toLocaleDateString('en-IN');

    // 1) Reminders to the current-level approver(s), grouped by role
    const byRole = {};
    for (const d of docs) { const k = d.role_code || '__NONE__'; if (!byRole[k]) byRole[k] = []; byRole[k].push(d); }
    for (const role of Object.keys(byRole)) {
      const items = byRole[role];
      let recipients = role === '__NONE__' ? [] : await resolveRoleEmails(role);
      if (recipients.length === 0) recipients = adminEmails; // fallback when no user holds the role
      const roleLabel = role === '__NONE__' ? 'an approver (workflow role unresolved)' : role;
      const html = this.approvalsHtml('Pending Approvals — Action Required', `${items.length} document(s) awaiting ${roleLabel}`, items, '#b45309', 'Open Approvals');
      const subject = `[Fixtag] Pending Approvals Reminder — ${todayStr}`;
      for (const to of recipients) await this.sendToRecipient(to, subject, html, clientId, 'APPROVAL_REMINDER', items[0].id);
    }

    // 2) Escalation to admins for items pending >= ESCALATE_DAYS
    const escalations = docs.filter((d) => d.age >= ESCALATE_DAYS);
    if (escalations.length > 0) {
      let admins = [];
      for (const rc of ['CLIENT_ADMIN', 'ADMIN', 'SUPER_ADMIN']) admins = admins.concat(await resolveRoleEmails(rc));
      admins = [...new Set(admins)];
      if (admins.length === 0) admins = adminEmails;
      const html = this.approvalsHtml('Overdue Approvals — Escalation', `${escalations.length} document(s) pending ${ESCALATE_DAYS}+ days`, escalations, '#dc2626', 'Open Approvals');
      const subject = `[Fixtag] Approval Escalation — ${todayStr}`;
      for (const to of admins) await this.sendToRecipient(to, subject, html, clientId, 'APPROVAL_ESCALATION', escalations[0].id);
    }
  }

  async sendToRecipient(to, subject, html, clientId, entityType, entityId) {
    let status = 'FAILED'; let errorMessage = null;
    try {
      const result = await notificationEmailService.sendEmail({ to, subject, html });
      status = result.success ? 'SENT' : 'FAILED';
      if (!result.success) errorMessage = result.error || result.reason || 'Unknown error';
    } catch (err) { errorMessage = err.message; }
    try {
      await NotificationLog.create({ client_id: clientId, entity_type: entityType, entity_id: entityId, notification_type: 'EMAIL', sent_to: to, subject, status, error_message: errorMessage });
    } catch { /* non-fatal */ }
  }

  approvalsHtml(title, subtitle, items, color, ctaLabel) {
    const rows = items.map((d) => `
      <tr>
        <td style="border:1px solid #ddd;padding:8px">${d.type}</td>
        <td style="border:1px solid #ddd;padding:8px">${d.number || d.id}</td>
        <td style="border:1px solid #ddd;padding:8px;text-align:right">${d.amount ? '₹' + d.amount.toLocaleString('en-IN') : '—'}</td>
        <td style="border:1px solid #ddd;padding:8px;text-align:center">L${d.level}${d.role_code ? ' · ' + d.role_code : ''}</td>
        <td style="border:1px solid #ddd;padding:8px;text-align:center;color:${d.age >= 5 ? '#dc2626' : '#b45309'};font-weight:bold">${d.age} day(s)</td>
      </tr>`).join('');
    const table = `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Type</th>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Number</th>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:right">Amount</th>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:center">Level</th>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:center">Pending</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    return this.wrapEmail(color, title, subtitle, table, `${process.env.CLIENT_URL || 'http://localhost:3000'}/requests/approval-requests`, ctaLabel);
  }

  async sendDigestEmail(adminEmails, subject, html, clientId, entityType, entityId) {
    if (adminEmails.length === 0) return;
    const sentTo = adminEmails[0]; // send to first admin; CC others as needed

    let status = 'FAILED';
    let errorMessage = null;

    try {
      const result = await notificationEmailService.sendEmail({ to: sentTo, subject, html });
      status = result.success ? 'SENT' : 'FAILED';
      if (!result.success) errorMessage = result.error || result.reason || 'Unknown error';
    } catch (err) {
      errorMessage = err.message;
    }

    try {
      await NotificationLog.create({ client_id: clientId, entity_type: entityType, entity_id: entityId, notification_type: 'EMAIL', sent_to: sentTo, subject, status, error_message: errorMessage });
    } catch { /* log failure is non-fatal */ }
  }

  maintenanceHtml(records) {
    const rows = records.map((r) => `
      <tr>
        <td style="border:1px solid #ddd;padding:8px">${r.Asset?.asset_name || '—'}</td>
        <td style="border:1px solid #ddd;padding:8px">${r.Asset?.asset_code || '—'}</td>
        <td style="border:1px solid #ddd;padding:8px">${new Date(r.scheduled_date).toLocaleDateString('en-IN')}</td>
        <td style="border:1px solid #ddd;padding:8px;color:#dc2626;font-weight:bold">OVERDUE</td>
      </tr>`).join('');
    return this.wrapEmail('#1e40af', 'Overdue Maintenance Alert', `${records.length} maintenance record(s) are past their scheduled date`, `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Asset Name</th><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Asset Code</th><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Scheduled Date</th><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
      `${process.env.CLIENT_URL || 'http://localhost:3000'}/maintenance/plans`, 'View Maintenance Plans');
  }

  insuranceHtml(records) {
    const rows = records.map((r) => `
      <tr>
        <td style="border:1px solid #ddd;padding:8px">${r.asset?.asset_name || '—'}</td>
        <td style="border:1px solid #ddd;padding:8px">${r.policy_number}</td>
        <td style="border:1px solid #ddd;padding:8px">${new Date(r.expiry_date).toLocaleDateString('en-IN')}</td>
        <td style="border:1px solid #ddd;padding:8px;color:#ea580c;font-weight:bold">EXPIRING SOON</td>
      </tr>`).join('');
    return this.wrapEmail('#f97316', 'Expiring Insurance Alert', `${records.length} insurance policy(ies) expiring within 30 days`, `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Asset</th><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Policy Number</th><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Expiry Date</th><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
      `${process.env.CLIENT_URL || 'http://localhost:3000'}/maintenance/insurance`, 'View Insurance');
  }

  warrantyHtml(records) {
    const rows = records.map((r) => `
      <tr>
        <td style="border:1px solid #ddd;padding:8px">${r.Asset?.asset_name || '—'}</td>
        <td style="border:1px solid #ddd;padding:8px">${r.warranty_code}</td>
        <td style="border:1px solid #ddd;padding:8px">${new Date(r.end_date).toLocaleDateString('en-IN')}</td>
        <td style="border:1px solid #ddd;padding:8px;color:#ea580c;font-weight:bold">EXPIRING SOON</td>
      </tr>`).join('');
    return this.wrapEmail('#8b5cf6', 'Expiring Warranty Alert', `${records.length} warranty(ies) expiring within 30 days`, `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Asset</th><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Warranty Code</th><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">End Date</th><th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
      `${process.env.CLIENT_URL || 'http://localhost:3000'}/maintenance/amc-warranty`, 'View Warranties');
  }

  amcHtml(records) {
    const rows = records.map((r) => `
      <tr>
        <td style="border:1px solid #ddd;padding:8px">${(r.asset && (r.asset.asset_name || r.asset.asset_code)) || r.asset_id || '-'}</td>
        <td style="border:1px solid #ddd;padding:8px">${r.amc_type || '-'}</td>
        <td style="border:1px solid #ddd;padding:8px">${(r.vendor && r.vendor.vendor_name) || '-'}</td>
        <td style="border:1px solid #ddd;padding:8px">${new Date(r.end_date).toLocaleDateString('en-IN')}</td>
        <td style="border:1px solid #ddd;padding:8px;color:#ea580c;font-weight:bold">EXPIRING SOON</td>
      </tr>`).join('');
    return this.wrapEmail('#0d9488', 'Expiring AMC Alert', `${records.length} AMC contract(s) expiring within 30 days`, `
      <table style="border-collapse:collapse;width:100%">
        <thead><tr>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Asset</th>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">AMC Type</th>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Vendor</th>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">End Date</th>
          <th style="background:#f3f4f6;border:1px solid #ddd;padding:10px;text-align:left">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
      `${process.env.CLIENT_URL || 'http://localhost:3000'}/maintenance/amc`, 'View AMC Management');
  }

  wrapEmail(headerColor, title, subtitle, tableHtml, ctaUrl, ctaLabel) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;margin:0;padding:0">
      <div style="max-width:800px;margin:0 auto;padding:20px">
        <div style="background:${headerColor};color:#fff;padding:20px;border-radius:4px;margin-bottom:20px">
          <h1 style="margin:0;font-size:22px">${title}</h1>
          <p style="margin:4px 0 0;opacity:.9">${subtitle}</p>
        </div>
        <p>Dear Administrator,</p>
        ${tableHtml}
        <p><strong>Action Required:</strong> Please review and take the necessary action.</p>
        <p><a href="${ctaUrl}" style="background:${headerColor};color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block">${ctaLabel}</a></p>
        <div style="color:#6b7280;font-size:12px;margin-top:30px;border-top:1px solid #ddd;padding-top:10px">
          <p>This is an automated notification from Fixtag Fixed Asset Management System. Please do not reply.</p>
        </div>
      </div>
    </body></html>`;
  }
}

module.exports = new NotificationSchedulerService();
