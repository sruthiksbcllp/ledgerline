'use strict';
const { Op } = require('sequelize');
const { isDevAdminRole } = require('./devRole');
const securityEvents = require('./securityEvents');
// CANARY-v2 — if you see this in server startup, the file is being read correctly

const buildWhere = (req) => {
  if (!req.user) throw new Error("Unauthorized");
  const role = req.user.role;
  // Only PROVIDER_ADMIN (and DEV_ADMIN in non-prod) bypass tenant filter.
  // SUPER_ADMIN is per-client — MUST be scoped to their client_id.
  if (role === 'PROVIDER_ADMIN' || isDevAdminRole(role)) {
    return {};
  }
  if (!req.user.client_id) {
    throw new Error("Tenant context missing -- user has no client_id assigned");
  }
  return { client_id: req.user.client_id };
};

const buildAdminWhere = (req) => {
  if (!req.user) throw new Error("Unauthorized");
  const role = req.user.role;
  // Only PROVIDER_ADMIN (and DEV_ADMIN in non-prod) bypass tenant filter.
  // SUPER_ADMIN is per-client — MUST be scoped to their client_id.
  if (role === 'PROVIDER_ADMIN' || isDevAdminRole(role)) {
    return {};
  }
  if (!req.user.client_id) {
    throw new Error("Tenant context missing -- user has no client_id assigned");
  }
  return { client_id: req.user.client_id };
};

const enforceTenant = (data, user) => {
  if (!user) throw new Error("Unauthorized");
  if (!data) return false;
  if (user.role === 'PROVIDER_ADMIN' || isDevAdminRole(user.role)) return true;
  if (!data.client_id) return true;
  return data.client_id === user.client_id;
};

const isWriteAllowed = (req) => {
  if (!req.user) throw new Error("Unauthorized");
  if (req.user.role === 'AUDITOR') return false;
  return true;
};

const getClientId = (req) => {
  if (!req.user) throw new Error("Unauthorized");
  const role = (req.user.role || '').toUpperCase();
  // CANARY: PROVIDER_ADMIN check v2
  if (role === 'PROVIDER_ADMIN' || isDevAdminRole(role)) {
    return req.body?.client_id || req.user.client_id || null;
  }
  if (!req.user.client_id) {
    throw new Error("Tenant context missing -- user has no client_id assigned");
  }
  return req.user.client_id;
};


// ─── FT-002/FT-004 Batch 0 — tenant-guarded fetch utilities (NEW, unwired) ───

// Resolve the caller's tenant for violation classification.
// Returns null for PROVIDER_ADMIN/DEV_ADMIN (no probe — they may act cross-tenant).
const _callerClientId = (req) => {
  const where = buildWhere(req);
  return Object.prototype.hasOwnProperty.call(where, 'client_id') ? where.client_id : null;
};

const _assertClientIdModel = (Model) => {
  const attrs = (Model && (Model.rawAttributes || (Model.getAttributes && Model.getAttributes()))) || {};
  if (!attrs.client_id) {
    throw new TypeError(
      `findOneTenanted requires a model with a client_id attribute (got ${Model && Model.name}). ` +
      'Use findOneViaParent for join-based tenancy.'
    );
  }
};

const _violationCtx = (req, Model, id, where) => ({
  user_id: req.user && req.user.id,
  actor_client_id: _callerClientId(req),
  target_model: Model.name,
  target_id: id,
  target_where: where,
  request_path: req.originalUrl || req.url || null,
  ip_address: req.ip || null,
  actor_role: req.user && req.user.role
});

// U1 — Category A (model has client_id). Composite/arbitrary where supported.
const findOneTenantedWhere = async (Model, where, req, opts = {}) => {
  _assertClientIdModel(Model);
  if (!where || typeof where !== 'object' || Array.isArray(where) || Object.keys(where).length === 0) {
    throw new TypeError('findOneTenantedWhere requires a non-empty where object');
  }
  if (Object.prototype.hasOwnProperty.call(where, 'client_id')) {
    throw new TypeError('caller must not set client_id in where; tenancy is enforced by the utility');
  }
  const tenantWhere = buildWhere(req); // throws if a scoped user has no client_id
  const row = await Model.findOne({ ...opts, where: { ...where, ...tenantWhere } });
  if (row) return row;

  const cid = _callerClientId(req);
  if (cid != null) {
    try {
      const probe = await Model.findOne({ where, attributes: ['id', 'client_id'] });
      if (probe && probe.client_id != null && probe.client_id !== cid) {
        securityEvents.recordTenantViolation(_violationCtx(req, Model, probe.id, where));
      }
    } catch (_) { /* probe is best-effort */ }
  }
  return null;
};

const findOneTenanted = (Model, id, req, opts = {}) => {
  if (id === undefined || id === null || (typeof id === 'number' && Number.isNaN(id))) {
    return Promise.resolve(null);
  }
  return findOneTenantedWhere(Model, { id }, req, opts);
};

// Service variant — no req; tenant supplied directly (null = provider, no filter).
const findOneTenantedByClient = async (Model, id, clientId, opts = {}) => {
  _assertClientIdModel(Model);
  if (id === undefined || id === null) return null;
  const where = { id };
  if (clientId != null) where.client_id = clientId;
  return Model.findOne({ ...opts, where });
};

// U2 — Category B (tenancy through a parent row). Composite where supported.
const findOneViaParentWhere = async (Model, where, req, cfg = {}) => {
  const { parent, as, parentKey = 'client_id', opts = {} } = cfg;
  if (!parent) throw new TypeError('findOneViaParent requires cfg.parent');
  const pAttrs = (parent.rawAttributes || (parent.getAttributes && parent.getAttributes())) || {};
  if (!pAttrs[parentKey]) throw new TypeError(`parent model ${parent.name} has no ${parentKey} attribute`);
  if (!where || typeof where !== 'object' || Array.isArray(where) || Object.keys(where).length === 0) {
    throw new TypeError('findOneViaParentWhere requires a non-empty where object');
  }
  const tenantWhere = buildWhere(req); // {} for PROVIDER_ADMIN
  const include = [{
    model: parent, ...(as ? { as } : {}), required: true,
    attributes: ['id', parentKey], where: tenantWhere
  }];
  const row = await Model.findOne({ ...opts, where, include });
  if (row) return row;

  const cid = _callerClientId(req);
  if (cid != null) {
    try {
      const probe = await Model.findOne({
        where,
        include: [{ model: parent, ...(as ? { as } : {}), required: false, attributes: ['id', parentKey] }]
      });
      const parentRow = probe && (as ? probe[as] : probe[parent.name]);
      const pcid = parentRow && parentRow[parentKey];
      if (pcid != null && pcid !== cid) {
        securityEvents.recordTenantViolation(_violationCtx(req, Model, probe.id, where));
      }
    } catch (_) { /* best-effort */ }
  }
  return null;
};

const findOneViaParent = (Model, id, req, cfg = {}) => {
  if (id === undefined || id === null) return Promise.resolve(null);
  return findOneViaParentWhere(Model, { id }, req, cfg);
};

// Company-scoped users can never choose a tenant: any client_id they send in the body or
// query string is replaced with their own, so handlers that read req.body.client_id
// (create/update user, mass-assigned updates) cannot create or move rows into another company.
const pinRequestTenant = (req) => {
  const role = String(req.user?.role || '').toUpperCase();
  if (!req.user || role === 'PROVIDER_ADMIN' || isDevAdminRole(role)) return;
  const own = req.user.client_id ?? null;
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      && Object.prototype.hasOwnProperty.call(req.body, 'client_id')) {
    req.body.client_id = own;
  }
  if (req.query && Object.prototype.hasOwnProperty.call(req.query, 'client_id')) {
    // Express 5 exposes req.query through a getter, so redefine it rather than mutate.
    const query = { ...req.query, client_id: own == null ? undefined : String(own) };
    Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true });
  }
};

module.exports = { pinRequestTenant, buildWhere, buildAdminWhere, enforceTenant, isWriteAllowed, getClientId, findOneTenanted, findOneTenantedWhere, findOneTenantedByClient, findOneViaParent, findOneViaParentWhere };
