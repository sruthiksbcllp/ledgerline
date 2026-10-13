'use strict';
const { IntegrationConfig, IntegrationQueue, IntegrationLog } = require('../models');
const axios = require('axios');

exports.getConfigs = async (req, res) => {
  try {
    const configs = await IntegrationConfig.findAll();
    res.json({ success: true, data: configs });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const { 
      erp_type, base_url, auth_token, is_active, sync_frequency,
      integration_name, integration_type, auth_type, username, password 
    } = req.body;
    let config = await IntegrationConfig.findOne({ where: { erp_type } });
    
    if (config) {
      await config.update({ 
        base_url, auth_token, is_active, sync_frequency,
        integration_name, integration_type, auth_type, username, password 
      });
    } else {
      config = await IntegrationConfig.create({ 
        erp_type, base_url, auth_token, is_active, sync_frequency,
        integration_name, integration_type, auth_type, username, password 
      });
    }
    res.json({ success: true, data: config, message: 'Config saved' });
  } catch (err) {
    res.json({ success: true, data: {} });
  }
};

exports.getQueue = async (req, res) => {
  try {
    const queue = await IntegrationQueue.findAll({
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json({ success: true, data: queue });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const logs = await IntegrationLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json({ success: true, data: logs });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
};

exports.pushManualSync = async (req, res) => {
  try {
    const { erp_type, action, payload } = req.body;
    const { pushToQueue } = require('../services/integrationEngine');
    const queueItem = await pushToQueue(erp_type, action, payload);
    res.json({ success: true, data: queueItem, message: 'Added to sync queue' });
  } catch (err) {
    res.json({ success: true, data: {} });
  }
};

exports.fetchAssetFromErp = async (req, res) => {
  try {
    const reference = String(req.params.reference || '').trim();
    const erpType = String(req.query.erp_type || 'SAP').toUpperCase();
    if (!reference) {
      return res.status(400).json({ success: false, message: 'ERP reference is required' });
    }

    const config = await IntegrationConfig.findOne({
      where: { erp_type: erpType, is_active: true }
    });

    if (!config) {
      return res.json({
        success: true,
        erp_enabled: false,
        message: 'No active ERP integration configured for this client',
        data: null
      });
    }

    const baseUrl = String(config.base_url || '').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/assets/${encodeURIComponent(reference)}`;
    const headers = {};
    if (config.auth_token) headers.Authorization = `Bearer ${config.auth_token}`;

    let external;
    try {
      external = await axios.get(endpoint, {
        headers,
        timeout: 12000
      });
    } catch (error) {
      await IntegrationLog.create({
        erp_type: config.erp_type,
        status: 'ERROR',
        message: `ERP fetch failed: ${error.message}`,
        request_payload: { reference, endpoint }
      });

      return res.json({
        success: true,
        erp_enabled: true,
        data: null,
        message: 'ERP integration is enabled, but no matching asset was returned'
      });
    }

    const payload = external?.data?.data || external?.data || {};
    const mapped = {
      asset_name: payload.asset_name || payload.name || '',
      asset_description: payload.asset_description || payload.description || '',
      model: payload.model || '',
      serial_number: payload.serial_no || payload.serial_number || '',
      purchase_cost: payload.purchase_cost || payload.amount || 0,
      invoice_number: payload.invoice_number || payload.invoice_no || '',
      purchase_date: payload.purchase_date || payload.invoice_date || null,
      quantity: payload.quantity || 1,
      erp_asset_reference: reference
    };

    await IntegrationLog.create({
      erp_type: config.erp_type,
      status: 'SUCCESS',
      message: 'ERP asset fetched',
      request_payload: { reference, endpoint }
    });

    res.json({
      success: true,
      erp_enabled: true,
      data: mapped
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'ERP fetch failed' });
  }
};

const crypto = require('crypto');
const { ApiKey } = require('../models');

exports.getKeys = async (req, res) => {
  try {
    const keys = await ApiKey.findAll({ where: { status: 'ACTIVE' } });
    // Strip secret_key from response
    const safe = keys.map(k => ({
      id: k.id, label: k.label, api_key: k.api_key,
      status: k.status, last_used: k.last_used, createdAt: k.createdAt
    }));
    res.json({ success: true, data: safe });
  } catch (error) {
    res.json({ success: true, data: [] });
  }
};

exports.generateApiKey = async (req, res) => {
  try {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const apiKey = await ApiKey.create({
      label: req.body.label || 'API Key',
      api_key: rawKey,
      secret_key: rawSecret,
      entity_id: req.body.entity_id || 0,
      status: 'ACTIVE'
    });
    // Return the key once — after this it won't be shown again
    res.json({
      success: true,
      data: { id: apiKey.id, label: apiKey.label, api_key: rawKey, status: 'ACTIVE' },
      message: 'API key created. Save the key — it will not be shown again.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

exports.revokeKey = async (req, res) => {
  try {
    await ApiKey.update({ status: 'REVOKED' }, { where: { id: req.params.id } });
    res.json({ success: true, data: {}, message: 'API key revoked' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

// ─── WEBHOOK — Inbound callback from ERP ────────────────────────
/**
 * POST /api/integration/webhook
 *
 * Oracle Fusion (or any ERP) calls this endpoint to report the outcome
 * of a journal voucher it received from FIX-TAG.
 *
 * Expected body:
 * {
 *   queue_id:      number,          // the IntegrationQueue.id we sent
 *   erp_reference: string,          // ERP-side document number (e.g. Oracle JV #)
 *   status:        'SUCCESS'|'REJECTED'|'ERROR',
 *   message:       string,          // human-readable detail / rejection reason
 *   erp_payload:   object|null      // optional: any extra data the ERP returns
 * }
 *
 * Auth: X-API-Key header (validated by apiKeyAuth middleware on the route).
 */
exports.webhook = async (req, res) => {
  try {
    const { queue_id, erp_reference, status, message, erp_payload } = req.body;

    if (!queue_id || !status) {
      return res.status(400).json({
        success: false,
        message: 'queue_id and status are required'
      });
    }

    const validStatuses = ['SUCCESS', 'REJECTED', 'ERROR'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Find the queue item
    const queueItem = await IntegrationQueue.findByPk(queue_id);
    if (!queueItem) {
      return res.status(404).json({
        success: false,
        message: `Queue item ${queue_id} not found`
      });
    }

    // Update queue status
    const newQueueStatus = status === 'SUCCESS' ? 'COMPLETED'
      : status === 'REJECTED' ? 'FAILED'
      : 'FAILED';

    await queueItem.update({
      status: newQueueStatus,
      error_message: status !== 'SUCCESS' ? (message || `ERP returned ${status}`) : null
    });

    // Log the callback
    await IntegrationLog.create({
      queue_id: queueItem.id,
      erp_type: queueItem.erp_type,
      status,
      request_payload: req.body,
      response_payload: erp_payload || null,
      message: message || `ERP webhook: ${status}${erp_reference ? ` (ref: ${erp_reference})` : ''}`
    });

    res.json({
      success: true,
      message: `Queue item ${queue_id} updated to ${newQueueStatus}`,
      data: {
        queue_id: queueItem.id,
        queue_status: newQueueStatus,
        erp_reference
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Webhook processing failed' });
  }
};

// ─── GL EXPORT — Pull journal entries for ERP consumption ───────
/**
 * GET /api/integration/gl-export
 *
 * Returns journal entries from the integration queue in a flat,
 * ERP-friendly format. Oracle Fusion can poll this endpoint to
 * pull pending JVs via scheduled ESS job or FBDI import.
 *
 * Query params:
 *   status      — PENDING | COMPLETED | FAILED | all  (default: PENDING)
 *   book_type   — SLM_COMPANIES_ACT | WDV_IT_ACT | all (default: all)
 *   from        — ISO date (journal_date >=)
 *   to          — ISO date (journal_date <=)
 *   limit       — max rows (default 200, max 1000)
 *   mark_exported — true/false: if true, marks PENDING items as PROCESSING
 *                   so they aren't re-pulled (default: false)
 *
 * Auth: either JWT (PROVIDER_ADMIN panel) or X-API-Key (external ERP poll).
 *       The route mounts both auth paths.
 */
exports.glExport = async (req, res) => {
  try {
    const {
      status: qStatus = 'PENDING',
      book_type,
      from,
      to,
      limit: rawLimit = 200,
      mark_exported
    } = req.query;

    const limit = Math.min(parseInt(rawLimit, 10) || 200, 1000);
    const { Op } = require('sequelize');

    // Build where clause
    const where = {};

    // Filter by queue status
    if (qStatus && qStatus !== 'all') {
      where.status = qStatus;
    }

    // Only GL-related actions
    where.action = {
      [Op.in]: [
        'POST_DEPRECIATION_JV',
        'POST_ACQUISITION_JV',
        'POST_DISPOSAL_JV',
        'POST_TRANSFER_JV'
      ]
    };

    const queueItems = await IntegrationQueue.findAll({
      where,
      order: [['createdAt', 'ASC']],
      limit
    });

    // Transform into flat GL journal format
    const journals = [];

    for (const item of queueItems) {
      const payload = item.payload || {};
      const journalDate = payload.journal_date || item.createdAt;
      const bookType = payload.meta?.book_type || null;

      // Apply book_type filter on payload (not a DB column)
      if (book_type && book_type !== 'all' && bookType && bookType !== book_type) {
        continue;
      }

      // Apply date range filter on journal_date
      if (from && journalDate < from) continue;
      if (to && journalDate > to) continue;

      const entries = payload.entries || [];
      const jvNumber = `FTAG-${String(item.id).padStart(8, '0')}`;

      // Each entry becomes a GL line
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        journals.push({
          jv_number: jvNumber,
          queue_id: item.id,
          erp_type: item.erp_type,
          event_type: payload.event_type,
          journal_date: journalDate,
          line_number: i + 1,
          ledger_account: e.ledger,
          debit: Number(e.debit) || 0,
          credit: Number(e.credit) || 0,
          currency: 'INR',
          narration: payload.narration || '',
          book_type: bookType,
          fiscal_year: payload.meta?.fiscal_year || null,
          period_month: payload.meta?.period_month || null,
          asset_count: payload.meta?.asset_count || null,
          reference_info: payload.meta ? JSON.stringify({
            asset_code: payload.meta.asset_code,
            po_number: payload.meta.po_number,
            disposal_method: payload.meta.disposal_method,
            from_company: payload.meta.from_company,
            to_company: payload.meta.to_company
          }) : null,
          queue_status: item.status,
          created_at: item.createdAt
        });
      }
    }


    // Optionally mark as PROCESSING so ERP doesn't re-pull
    if (mark_exported === 'true') {
      const pendingIds = queueItems
        .filter(q => q.status === 'PENDING')
        .map(q => q.id);

      if (pendingIds.length > 0) {
        const { Op: Op2 } = require('sequelize');
        await IntegrationQueue.update(
          { status: 'PROCESSING' },
          { where: { id: { [Op2.in]: pendingIds } } }
        );
      }
    }

    res.json({
      success: true,
      count: journals.length,
      queue_items: queueItems.length,
      filters: { status: qStatus, book_type: book_type || 'all', from, to },
      data: journals
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'GL export failed' });
  }
};
