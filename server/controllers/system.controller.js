'use strict';
const { FeatureToggle, GlobalSetting } = require('../models');

const DEFAULT_FEATURES = [
  { feature_key: 'PROCUREMENT_MODULE', feature_name: 'Procurement Module', module: 'PROCUREMENT', is_enabled: true },
  { feature_key: 'FINANCE_MODULE', feature_name: 'Finance & CWIP Module', module: 'FINANCE', is_enabled: true },
  { feature_key: 'ENABLE_INVOICE_MODULE', feature_name: 'Invoice Processing', module: 'FINANCE', is_enabled: true },
  { feature_key: 'ASSET_MODULE', feature_name: 'Asset Management Module', module: 'ASSET', is_enabled: true },
  { feature_key: 'PROPERTY_MODULE', feature_name: 'Property Management Module', module: 'PROPERTY', is_enabled: true },
  { feature_key: 'INVENTORY_MODULE', feature_name: 'Inventory Management Module', module: 'INVENTORY', is_enabled: true },
  { feature_key: 'AUDIT_MODULE', feature_name: 'Audit Module', module: 'AUDIT', is_enabled: true },
  { feature_key: 'ALERTS_MODULE', feature_name: 'Alerts Module', module: 'ALERTS', is_enabled: true },
  { feature_key: 'REPORTS_MODULE', feature_name: 'Reporting Engine', module: 'REPORTS', is_enabled: true },
  { feature_key: 'REQUEST_MODULE', feature_name: 'Request Management Module', module: 'REQUEST', is_enabled: true },
  { feature_key: 'CLIENT_MODULE', feature_name: 'Client Management Module', module: 'CLIENT', is_enabled: true },
  { feature_key: 'MAINTENANCE_MODULE', feature_name: 'Maintenance & AMC', module: 'MAINTENANCE', is_enabled: true },
  { feature_key: 'GL_INTEGRATION', feature_name: 'GL Integration (Auto Journal Posting)', module: 'FINANCE', is_enabled: false },
  { feature_key: 'CAPITALISATION_APPROVAL', feature_name: 'Capitalisation Approval Gate', module: 'FINANCE', is_enabled: false },
  { feature_key: 'CAPEX_ONLY_ASSET_CREATION', feature_name: 'CAPEX-only Asset Creation at GRN', module: 'FINANCE', is_enabled: false }
];

exports.getAllFeatures = async (req, res) => {
  try {
    // client_id query param: PROVIDER_ADMIN can request features for a specific client; fallback to user's client_id
    const clientId = req.query.client_id ? Number(req.query.client_id) : (req.user?.client_id || null);

    // Get global defaults (client_id IS NULL)
    const { Op } = require('sequelize');
    const globalRows = await FeatureToggle.findAll({ where: { client_id: null } });
    const globalByKey = new Map(globalRows.map(item => [item.feature_key, item]));

    // Ensure all DEFAULT_FEATURES exist as global rows
    for (const feature of DEFAULT_FEATURES) {
      if (!globalByKey.has(feature.feature_key)) {
        const created = await FeatureToggle.create({ ...feature, client_id: null });
        globalByKey.set(feature.feature_key, created);
      }
    }

    let result;
    if (clientId) {
      // Get per-client overrides
      const clientRows = await FeatureToggle.findAll({ where: { client_id: clientId } });
      const clientByKey = new Map(clientRows.map(item => [item.feature_key, item]));

      // Merge: client override wins, fallback to global
      result = DEFAULT_FEATURES.map(def => {
        if (clientByKey.has(def.feature_key)) {
          return { ...clientByKey.get(def.feature_key).toJSON(), _source: 'client' };
        }
        return { ...globalByKey.get(def.feature_key).toJSON(), _source: 'global' };
      });
    } else {
      result = DEFAULT_FEATURES.map(def => ({
        ...globalByKey.get(def.feature_key).toJSON(),
        _source: 'global'
      }));
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

exports.updateFeature = async (req, res) => {
  try {
    const { key } = req.params;
    const { is_enabled } = req.body;
    // client_id in body: if set, save per-client override; else update global
    const clientId = req.body.client_id ? Number(req.body.client_id) : null;

    const where = clientId
      ? { feature_key: key, client_id: clientId }
      : { feature_key: key, client_id: null };

    const feature = await FeatureToggle.findOne({ where });
    if (!feature) {
      const fallback = DEFAULT_FEATURES.find(item => item.feature_key === key);
      await FeatureToggle.create({
        client_id: clientId,
        feature_key: key,
        feature_name: fallback ? fallback.feature_name : key.replace(/_/g, ' '),
        module: fallback ? fallback.module : 'SYSTEM',
        is_enabled: typeof is_enabled === 'boolean' ? is_enabled : true
      });
      return res.json({ success: true, message: 'Feature override created' });
    }

    await feature.update({ is_enabled: !!is_enabled });
    res.json({ success: true, message: 'Feature updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

exports.getHealth = async (req, res) => {
  try {
    const { sequelize } = require('../models');
    await sequelize.authenticate();
    res.json({
      status: 'HEALTHY',
      database: 'CONNECTED',
      timestamp: new Date().toISOString(),
      version: '2.4.0',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      status: 'UNHEALTHY',
      database: 'DISCONNECTED',
      error: error.message
    });
  }
};

exports.getGlobalSettings = async (req, res) => {
  try {
    let settings = await GlobalSetting.findOne({ order: [['id', 'ASC']] });
    if (!settings) {
      settings = await GlobalSetting.create({});
    }
    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

exports.getSettings = exports.getGlobalSettings;

exports.updateSettings = async (req, res) => {
  try {
    const { recordAdminAction } = require('../utils/adminAudit');
    let settings = await GlobalSetting.findOne({ order: [['id', 'ASC']] });
    if (!settings) {
      settings = await GlobalSetting.create({});
    }

    const payload = req.body || {};
    const fields = [
      'company_name', 'company_logo', 'currency_symbol', 'date_format', 'fy_start_month',
      'default_depreciation_method', 'email_notifications', 'amc_reminder_days',
      'warranty_reminder_days', 'max_upload_size_mb', 'session_timeout_minutes',
      'allow_excel_export', 'allow_pdf_export'
    ];
    const previous = {};
    const next = {};
    for (const field of fields) {
      if (payload[field] !== undefined) {
        previous[field] = settings[field];
        settings[field] = payload[field];
        next[field] = payload[field];
      }
    }
    if (payload.enabled_features && typeof payload.enabled_features === 'object') {
      previous.enabled_features = settings.enabled_features;
      settings.enabled_features = {
        ...(settings.enabled_features || {}),
        ...payload.enabled_features
      };
      next.enabled_features = settings.enabled_features;
    }
    if (req.user?.id) settings.updated_by = req.user.id;

    await settings.save();
    recordAdminAction(req, {
      action: 'SETTINGS_UPDATED',
      module: 'SYSTEM',
      recordId: settings.id,
      description: 'Updated application settings',
      oldValues: previous,
      newValues: next
    });
    return res.json({ success: true, data: settings, message: 'Settings updated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};
