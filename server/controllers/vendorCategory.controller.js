'use strict';
/**
 * CR-P04 — Vendor categorisation + item-category suggestion.
 * Maps vendors to asset categories (M:N) and suggests vendors for a given category.
 * Tenant-scoped. Additive; flag-gated at the route (VENDOR_CATEGORISATION).
 */
const { Vendor, VendorCategory, AssetCategory, sequelize } = require('../models');
const { success } = require('../utils/responseHandler');
const { getClientId, buildWhere } = require('../utils/tenantFilter');
const { recordTenantViolation } = require('../utils/securityEvents');
const fail = (res, msg, code = 500) => res.status(code).json({ success: false, message: msg });

const normalizeIds = (input) => Array.from(new Set((Array.isArray(input) ? input : [])
  .map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n > 0)));

// POST /:vendorId — replace a vendor's category mappings
exports.setCategories = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const vendor = await Vendor.findByPk(req.params.vendorId);
    if (!vendor) { await t.rollback(); return fail(res, 'Vendor not found', 404); }
    const clientId = getClientId(req) || vendor.client_id;
    if (vendor.client_id && Number(vendor.client_id) !== Number(clientId)) {
      recordTenantViolation({ user_id: req.user && req.user.id, actor_client_id: getClientId(req), target_model: 'Vendor', target_id: vendor.id, request_path: req.originalUrl, ip_address: req.ip, actor_role: req.user && req.user.role });
      await t.rollback(); return fail(res, 'Vendor does not belong to your tenant', 403);
    }
    const ids = normalizeIds(req.body && req.body.category_ids);
    await VendorCategory.destroy({ where: { vendor_id: vendor.id }, transaction: t });
    for (const cid of ids) {
      await VendorCategory.create({ vendor_id: vendor.id, category_id: cid, client_id: clientId }, { transaction: t });
    }
    await t.commit();
    return success(res, { vendor_id: vendor.id, category_ids: ids }, 'Vendor categories updated');
  } catch (e) { await t.rollback(); return fail(res, e.message); }
};

// GET /:vendorId — list a vendor's categories
exports.getCategories = async (req, res) => {
  try {
    const vendor = await Vendor.findByPk(req.params.vendorId);
    if (!vendor) return fail(res, 'Vendor not found', 404);
    const clientId = getClientId(req) || vendor.client_id;
    if (vendor.client_id && Number(vendor.client_id) !== Number(clientId)) return fail(res, 'Vendor does not belong to your tenant', 403);
    const rows = await VendorCategory.findAll({ where: { vendor_id: vendor.id }, include: [{ model: AssetCategory, as: 'category', attributes: ['id', 'category_name'] }] });
    return success(res, rows);
  } catch (e) { return fail(res, e.message); }
};

// GET /suggest?category_id= — suggest active vendors that supply a category (tenant-scoped)
exports.suggestByCategory = async (req, res) => {
  try {
    const categoryId = parseInt(req.query.category_id, 10);
    if (!Number.isInteger(categoryId) || categoryId <= 0) return fail(res, 'category_id is required', 400);
    const vendorWhere = { status: 'ACTIVE', ...buildWhere(req) };
    const rows = await VendorCategory.findAll({
      where: { category_id: categoryId },
      include: [{ model: Vendor, where: vendorWhere, attributes: ['id', 'vendor_name', 'email', 'procurement_type', 'gst_registered_state_code'], required: true }]
    });
    const vendors = rows.map((r) => r.Vendor).filter(Boolean);
    return success(res, vendors);
  } catch (e) { return fail(res, e.message); }
};
