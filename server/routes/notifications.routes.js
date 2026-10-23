'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { NotificationLog } = require('../models');
const notificationEmailService = require('../services/notificationEmail.service');
const notificationScheduler = require('../services/notificationScheduler.service');

/**
 * GET /api/notifications/logs
 * List notification logs with filtering
 */
router.get('/logs', verifyToken, tenantMiddleware, async (req, res) => {
  try {
    const { entity_type, status, limit = 50, offset = 0 } = req.query;
    const role = String(req.user?.role || '').toUpperCase();
    const isProviderAdmin = role === 'PROVIDER_ADMIN' || role === 'SUPER_ADMIN' || role === 'DEV_ADMIN';
    const clientId = req.user?.client_id;

    const where = {};
    if (!isProviderAdmin && clientId != null) where.client_id = clientId;
    if (entity_type) where.entity_type = entity_type;
    if (status) where.status = status;

    const { rows, count } = await NotificationLog.findAndCountAll({
      where,
      order: [['sent_at', 'DESC']],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      }
    });
  } catch (err) {
    // Backward-compatible fallback: some environments only have `notifications` table.
    if (err?.original?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          limit: parseInt(req.query.limit || 50, 10),
          offset: parseInt(req.query.offset || 0, 10)
        }
      });
    }
    res.status(500).json({ success: false, message: 'Failed to fetch notification logs' });
  }
});

/**
 * GET /api/notifications/settings
 * Get SMTP configuration status (ADMIN only)
 */
const getNotificationSettings = async (req, res) => {
  try {
    const role = String(req.user?.role || '').toUpperCase();
    const isAdmin = ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'].includes(role);

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const configured = notificationEmailService.isConfigured();
    res.json({
      success: true,
      data: {
        smtp_configured: configured,
        smtp_host: configured ? process.env.SMTP_HOST : null,
        message: configured ? 'SMTP is configured and ready to send emails' : 'SMTP is not configured. Email notifications will be logged to console only.'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch notification settings' });
  }
};

router.get('/settings', verifyToken, tenantMiddleware, getNotificationSettings);
// Backward-compatible alias used by some older clients/UIs.
router.get('/templates', verifyToken, tenantMiddleware, getNotificationSettings);

/**
 * POST /api/notifications/test
 * Send a test email to the current user
 */
router.post('/test', verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'User email not found' });
    }

    const subject = 'Fixtag Test Notification';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1e40af; color: white; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .footer { color: #6b7280; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Test Notification</h1>
            </div>
            <p>Hello ${req.user.first_name || 'User'},</p>
            <p>This is a test email from Fixtag Fixed Asset Management System.</p>
            <p>Email notifications are working correctly!</p>
            <p>Timestamp: ${new Date().toISOString()}</p>
            <div class="footer">
              <p>This is an automated notification from Fixtag Fixed Asset Management System.</p>
              <p>Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const result = await notificationEmailService.sendEmail({
      to: userEmail,
      subject,
      html
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        email: userEmail
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.reason || result.error || 'Failed to send test email',
        detail: result.reason === 'SMTP_NOT_CONFIGURED' ? 'SMTP is not configured in environment variables' : null
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to send test email' });
  }
});

/**
 * POST /api/notifications/run-now
 * Manually trigger the daily notification run (ADMIN only)
 */
router.post('/run-now', verifyToken, tenantMiddleware, async (req, res) => {
  try {
    const role = String(req.user?.role || '').toUpperCase();
    const isAdmin = ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'].includes(role);

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({
      success: true,
      message: 'Notification run queued',
      timestamp: new Date().toISOString()
    });

    setImmediate(async () => {
      try {
        await notificationScheduler.runDailyNotifications();
      } catch { /* background job — errors are non-fatal */ }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to trigger notifications' });
  }
});

module.exports = router;
