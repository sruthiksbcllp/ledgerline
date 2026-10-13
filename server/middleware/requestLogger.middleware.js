'use strict';
const crypto = require('crypto');
const logger = require('../utils/appLogger');
const { forward } = require('../services/siemForwarder.service');

const requestLogger = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const start = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    const evt = {
      event: 'http_request',
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: Number(durationMs.toFixed(2)),
      user_id: req.user?.id || null,
      client_id: req.user?.client_id || null,
      role: req.user?.role || null,
      ip: req.ip,
      user_agent: req.get('user-agent') || null
    };

    logger.info(evt);
    forward(evt);
  });

  next();
};

module.exports = requestLogger;
