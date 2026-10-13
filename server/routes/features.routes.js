'use strict';
const express = require('express');
const router = express.Router();
const { FeatureToggle } = require('../models');
const { verifyToken, checkPermission } = require('../middleware/auth.middleware');

router.use(verifyToken);

// GET all features — any authenticated user
router.get('/', async (req, res) => {
  try {
    const features = await FeatureToggle.findAll({ order: [['module','ASC'],['feature_name','ASC']] });
    res.json({ success: true, data: features });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT toggle — PROVIDER_ADMIN only
router.put('/:key', checkPermission('SYSTEM','EDIT'), async (req, res) => {
  try {
    const { is_enabled } = req.body;
    const [updated] = await FeatureToggle.update(
      { is_enabled },
      { where: { feature_key: req.params.key } }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Feature not found' });
    res.json({ success: true, message: 'Feature updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
