'use strict';
/**
 * API Key Authentication Middleware
 * ---------------------------------
 * Validates requests from external systems (Oracle Fusion, SAP, Tally, etc.)
 * that cannot use JWT. Expects header:  X-API-Key: <key>
 *
 * Looks up the key in the `apikeys` table. Key must be ACTIVE.
 * On success, sets req.apiKeyRecord with the matched row.
 */

const { ApiKey } = require('../models');

const verifyApiKey = async (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key) {
    return res.status(401).json({
      success: false,
      message: 'Missing X-API-Key header'
    });
  }

  try {
    const record = await ApiKey.findOne({
      where: { api_key: key, status: 'ACTIVE' }
    });

    if (!record) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or revoked API key'
      });
    }

    // Touch last_used timestamp (non-blocking)
    record.update({ last_used: new Date() }).catch(() => {});

    req.apiKeyRecord = record;
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'API key validation failed'
    });
  }
};

module.exports = { verifyApiKey };
