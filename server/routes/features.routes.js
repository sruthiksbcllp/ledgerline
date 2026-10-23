'use strict';
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { FeatureToggle } = require('../models');
const { verifyToken, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { recordAdminAction } = require('../utils/adminAudit');
const { isDevAdminRole } = require('../utils/devRole');

router.use(verifyToken);

// GET all features — any authenticated user
router.get('/', async (req, res) => {
  try {
    const role = String(req.user?.role || '').toUpperCase();
    const isPlatform = role === 'PROVIDER_ADMIN' || isDevAdminRole(role);
    // Company users see the global defaults plus their own company's overrides only.
    const where = isPlatform ? {} : { [Op.or]: [{ client_id: null }, { client_id: req.user?.client_id ?? null }] };
    const features = await FeatureToggle.findAll({ where, order: [['module','ASC'],['feature_name','ASC']] });
    res.json({ success: true, data: features });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT toggle — administrators only. Tenant admins change their own client override.
router.put('/:key', requireSeniorAdmin, async (req, res) => {
  try {
    const { is_enabled } = req.body;
    const role = String(req.user?.role || '').toUpperCase();
    const isPlatform = role === 'PROVIDER_ADMIN' || isDevAdminRole(role);
    const where = { feature_key: req.params.key };
    if (!isPlatform) {
      if (!req.user?.client_id) {
        return res.status(403).json({ success: false, message: 'A client is required to change module access' });
      }
      where.client_id = req.user.client_id;
    }
    const [updated] = await FeatureToggle.update({ is_enabled: !!is_enabled }, { where });
    if (!updated && !isPlatform) {
      const sample = await FeatureToggle.findOne({ where: { feature_key: req.params.key } });
      if (!sample) return res.status(404).json({ success: false, message: 'Feature not found' });
      await FeatureToggle.create({
        feature_key: sample.feature_key,
        feature_name: sample.feature_name,
        module: sample.module,
        is_enabled: !!is_enabled,
        client_id: req.user.client_id
      });
    } else if (!updated) {
      return res.status(404).json({ success: false, message: 'Feature not found' });
    }
    recordAdminAction(req, {
      action: 'FEATURE_UPDATED',
      module: 'SYSTEM',
      description: `${is_enabled ? 'Enabled' : 'Disabled'} ${req.params.key}`,
      newValues: { feature_key: req.params.key, is_enabled: !!is_enabled, client_id: where.client_id || null }
    });
    res.json({ success: true, message: 'Feature updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
