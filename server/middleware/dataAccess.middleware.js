'use strict';

/**
 * Read access by role (see config/dataAccess.js).
 *   requireRead('PO')  - refuses roles with no access to that data; sets req.readScope
 *   canSeeRow(req, row, { owner, vendor }) - for 'own' / 'vendor' scopes, is this record theirs?
 *   vendorIdOf(req)    - the vendor a VENDOR login belongs to (cached per request)
 */
const { readScope } = require('../config/dataAccess');

const requireRead = (resource) => (req, res, next) => {
  const scope = readScope(req.user?.role, resource);
  if (scope === 'none') {
    return res.status(403).json({ success: false, code: 'NO_DATA_ACCESS', message: 'Your role does not have access to this information.' });
  }
  req.readScope = { ...(req.readScope || {}), [resource]: scope };
  return next();
};

async function vendorIdOf(req) {
  if (req._vendorId !== undefined) return req._vendorId;
  const { User } = require('../models');
  const u = await User.findByPk(req.user.id, { attributes: ['vendor_id'] });
  req._vendorId = u?.vendor_id || null;
  return req._vendorId;
}

/**
 * True when the role may see this row under its scope for `resource`.
 * owner: column holding the user id that raised the row; vendor: column holding the vendor id.
 */
async function canSeeRow(req, resource, row, { owner, vendor } = {}) {
  if (!row) return false;
  const scope = readScope(req.user?.role, resource);
  if (scope === 'all') return true;
  if (scope === 'own') return Boolean(owner) && Number(row[owner] ?? row.get?.(owner)) === Number(req.user.id);
  if (scope === 'vendor') {
    const vid = await vendorIdOf(req);
    return Boolean(vid && vendor) && Number(row[vendor] ?? row.get?.(vendor)) === Number(vid);
  }
  return false;
}

/** Sequelize where-fragment narrowing a list for 'own' / 'vendor' scopes ({} for 'all'). */
async function scopeWhere(req, resource, { owner, vendor } = {}) {
  const scope = readScope(req.user?.role, resource);
  if (scope === 'all') return {};
  if (scope === 'own' && owner) return { [owner]: req.user.id };
  if (scope === 'vendor' && vendor) {
    const vid = await vendorIdOf(req);
    return { [vendor]: vid || -1 }; // no linked vendor: nothing matches
  }
  return { id: -1 }; // scope has no rule for this list: nothing
}

const notFound = (res) => res.status(404).json({ success: false, message: 'Not found' });

module.exports = { requireRead, canSeeRow, scopeWhere, vendorIdOf, notFound };
