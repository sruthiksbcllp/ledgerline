'use strict';

const nodemailer = require('nodemailer');

// CR-FG03c: primary transport is the Amazon SES API (region ap-south-2 has the
// SES API but NO SMTP endpoint). SMTP is kept only as a fallback for any
// environment still configured that way. Behaviour is fail-open: if neither
// SES_* nor SMTP_* credentials are present, sendEmail() is a no-op (byte-identical
// to the previous unconfigured behaviour) and emails are simply skipped.

class NotificationEmailService {
  constructor() {
    this.transporter = null;   // nodemailer (SMTP fallback)
    this.sesClient = null;     // AWS SES v2 client (primary)
    this.SendEmailCommand = null;
    this.mode = null;          // 'SES' | 'SMTP' | null
    this.initialized = false;
    this.initTransport();
  }

  initTransport() {
    // --- Primary: Amazon SES API (ap-south-2) ---
    const sesKey = process.env.SES_ACCESS_KEY_ID;
    const sesSecret = process.env.SES_SECRET_ACCESS_KEY;
    if (sesKey && sesSecret) {
      try {
        const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
        this.sesClient = new SESv2Client({
          region: process.env.SES_REGION || 'ap-south-2',
          credentials: { accessKeyId: sesKey, secretAccessKey: sesSecret },
        });
        this.SendEmailCommand = SendEmailCommand;
        this.mode = 'SES';
        this.initialized = true;
        return;
      } catch { /* SES client init failed — fall through to SMTP / fail-open */ }
    }

    // --- Fallback: SMTP (nodemailer) ---
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return; // not configured — fail-open, emails skipped
    }
    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: parseInt(smtpPort, 10) === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      this.mode = 'SMTP';
      this.initialized = true;
    } catch { /* transporter init failed — will skip email sending */ }
  }

  fromAddress() {
    return process.env.SES_FROM || process.env.SMTP_FROM || 'noreply@example.com';
  }

  senderEmail() {
    const f = this.fromAddress();
    const m = f.match(/<([^>]+)>/);
    return m ? m[1] : f.trim();
  }

  async sendEmail({ to, subject, html, from, replyTo }) {
    try {
      if (!this.initialized) {
        return { success: false, reason: 'EMAIL_NOT_CONFIGURED', logged: true };
      }

      if (this.mode === 'SES') {
        const cmd = new this.SendEmailCommand({
          FromEmailAddress: from || this.fromAddress(),
          Destination: { ToAddresses: [to] },
          ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: { Html: { Data: html, Charset: 'UTF-8' } },
            },
          },
        });
        const result = await this.sesClient.send(cmd);
        return { success: true, messageId: result.MessageId };
      }

      // SMTP fallback
      const result = await this.transporter.sendMail({ from: from || this.fromAddress(), to, subject, html, ...(replyTo ? { replyTo } : {}) });
      return { success: true, messageId: result.messageId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // CFG-02 — attachment-capable send. Builds a raw MIME (nodemailer MailComposer)
  // and sends it via SESv2 raw content, so it can carry a PDF. The simple sendEmail()
  // above is untouched. Fail-open: no creds => EMAIL_NOT_CONFIGURED, no send.
  async sendEmailWithAttachment({ to, cc, subject, html, from, attachments = [] }) {
    try {
      if (!this.initialized) {
        return { success: false, reason: 'EMAIL_NOT_CONFIGURED', logged: true };
      }
      const fromAddr = from || this.fromAddress();
      const ccList = Array.isArray(cc) ? cc.filter(Boolean) : (cc ? [cc] : []);
      const atts = (attachments || []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType || 'application/octet-stream' }));

      if (this.mode === 'SES') {
        const MailComposer = require('nodemailer/lib/mail-composer');
        const mail = new MailComposer({ from: fromAddr, to, cc: ccList.length ? ccList : undefined, subject, html, attachments: atts });
        const raw = await mail.compile().build();
        const cmd = new this.SendEmailCommand({
          FromEmailAddress: fromAddr,
          Destination: { ToAddresses: [to], ...(ccList.length ? { CcAddresses: ccList } : {}) },
          Content: { Raw: { Data: raw } },
        });
        const result = await this.sesClient.send(cmd);
        return { success: true, messageId: result.MessageId };
      }

      // SMTP fallback
      const result = await this.transporter.sendMail({ from: fromAddr, to, ...(ccList.length ? { cc: ccList } : {}), subject, html, attachments: atts });
      return { success: true, messageId: result.messageId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  isConfigured() {
    return this.initialized;
  }

  async sendWelcomeEmail({ firstName, lastName, email, username, password, loginUrl, roleName }) {
    const name = `${firstName} ${lastName}`.trim();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;margin:0;padding:0;background:#f8fafc">
  <div style="max-width:600px;margin:0 auto;padding:30px 20px">

    <div style="background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;padding:28px 32px;border-radius:8px 8px 0 0;text-align:center">
      <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px">FIX-TAG</div>
      <div style="font-size:13px;opacity:.85">Fixed Asset Management System</div>
    </div>

    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      <h2 style="margin:0 0 8px;font-size:20px;color:#111827">Welcome to Fixtag, ${firstName}!</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Your account has been created. Here are your login credentials:</p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#6b7280;width:120px">Full Name</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827">${name}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#6b7280">Username</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;font-family:monospace">${username}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#6b7280">Password</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;font-family:monospace">${password}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#6b7280">Role</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827">${roleName}</td>
          </tr>
        </table>
      </div>

      <p style="text-align:center;margin:0 0 24px">
        <a href="${loginUrl}" style="background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;font-size:15px">
          Login to Fixtag &rarr;
        </a>
      </p>

      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:14px 18px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#92400e">
          <strong>Security Tip:</strong> Please change your password immediately after your first login.
          Keep your credentials confidential and do not share them.
        </p>
      </div>

      <p style="font-size:13px;color:#6b7280;margin:0">
        If you have any trouble logging in, contact your system administrator.
      </p>
    </div>

    <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">
      This is an automated email from Fixtag FAMS. Please do not reply to this email.
    </p>
  </div>
</body></html>`;

    return this.sendEmail({
      to: `${name} <${email}>`,
      subject: `Welcome to Fixtag — Your login credentials`,
      html,
    });
  }
}

module.exports = new NotificationEmailService();
