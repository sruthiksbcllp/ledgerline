'use strict';
const { Client } = require('../models');

/**
 * Subdomain Tenant Resolver
 *
 * Reads the X-Subdomain header set by Nginx and resolves the matching
 * client record. Attaches req.subdomainClientId so the auth middleware
 * and login controller can scope the session to the correct tenant.
 *
 * Must be mounted BEFORE auth routes so login itself is subdomain-aware.
 */
const subdomainTenantMiddleware = async (req, res, next) => {
  try {
    const subdomain = (req.headers['x-subdomain'] || '').trim().toLowerCase();

    // No subdomain header → not a subdomain request, continue normally
    if (!subdomain || subdomain === 'www' || subdomain === 'app') {
      return next();
    }

    const client = await Client.findOne({
      where: { subdomain },
      attributes: ['id', 'client_name', 'subdomain']
    });

    if (!client) {
      // Unknown subdomain — still let the request through but flag it
      req.unknownSubdomain = subdomain;
      return next();
    }

    // Attach resolved tenant info to the request
    req.subdomainClientId = client.id;
    req.subdomainClientName = client.client_name;

    next();
  } catch (err) {
    // Non-fatal — log and continue rather than breaking the whole app
    console.error('[SubdomainMiddleware] Error:', err.message);
    next();
  }
};

module.exports = { subdomainTenantMiddleware };
