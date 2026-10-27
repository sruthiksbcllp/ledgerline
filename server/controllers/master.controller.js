'use strict';
const { 
  AssetCategory, AssetSubCategory, AssetStatus, AssetType,
  Department, SubDepartment, Region, Vendor, Unit,
  PropertyType, MaintenanceType, Role, Location, Property, User, 
  ServiceProvider, Invoice, VendorComplianceSnapshot,
  VendorDocument, VendorRiskHistory, Alert, ApprovalLog, VendorChangeRequest,
  VendorAsset, Asset, Entity, EntityGstRegistration
} = require('../models');

const { getCache, setCache, clearCache } = require('../services/cache.service');
const { success, error } = require('../utils/responseHandler');
const { buildWhere } = require('../utils/tenantFilter');
const { writeApprovalLog } = require('../utils/approvalTenancy');
const { missingFields, isComplete } = require('../utils/depreciationConfig');
const { Op, fn, col } = require('sequelize');

// Standardized HOF to return raw arrays with a 'name' field for dropdown compatibility
const getAll = (Model, nameField, opts = {}) => async (req, res) => {
  try {
    const { globalLookup = false } = opts;
    const clientId = req.user?.client_id;
    const cacheKey = `master_${Model.name.toLowerCase()}_${globalLookup ? 'global' : (clientId || 'global')}`;
    const shouldRefresh = req.query?.refresh === '1';
    const cachedData = shouldRefresh ? null : getCache(cacheKey);
    if (cachedData) return res.json({ success: true, data: cachedData, fromCache: true });

    const where = globalLookup ? {} : buildWhere(req);
    const data = await Model.findAll({ where });
    const mappedData = (data || []).map(item => ({
      ...item.get({ plain: true }),
      id: item.id,
      name: item[nameField] || item.name || item.category_name || item.dept_name || item.location_name || item.property_name || item.vendor_name || item.status_name || item.type_name
    }));

    setCache(cacheKey, mappedData);
    return success(res, mappedData);
  } catch (err) {
    return success(res, []);
  }
};

const getById = (Model, opts = {}) => async (req, res) => {
  try {
    const { globalLookup = false } = opts;
    const where = {
      id: req.params.id,
      ...(globalLookup ? {} : buildWhere(req))
    };

    const data = await Model.findOne({ where });
    return success(res, data);
  } catch (err) {
    return success(res, {});
  }
};

const createItem = (Model, opts = {}) => async (req, res) => {
  try {
    const { globalLookup = false } = opts;
    const payload = { ...req.body };
    if (!globalLookup && req.user?.client_id) payload.client_id = req.user.client_id;
    
    const data = await Model.create(payload);
    clearCache(`master_${Model.name.toLowerCase()}_${globalLookup ? 'global' : (req.user?.client_id || 'global')}`);
    return success(res, data, `${Model.name} created successfully`);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return error(res, 'This record already exists.', 400);
    }
    if (err.name === 'SequelizeValidationError') {
      return error(res, err.errors[0].message, 400);
    }
    return error(res, 'Internal server error');
  }
};

const updateItem = (Model, opts = {}) => async (req, res) => {
  try {
    const { globalLookup = false } = opts;
    const where = { id: req.params.id };
    if (!globalLookup && req.user?.client_id) where.client_id = req.user.client_id;

    const item = await Model.findOne({ where });
    if (!item) return error(res, 'Item not found', 404);

    await item.update(req.body);
    clearCache(`master_${Model.name.toLowerCase()}_${globalLookup ? 'global' : (req.user?.client_id || 'global')}`);
    return success(res, item, `${Model.name} updated successfully`);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return error(res, 'This record already exists.', 400);
    }
    return error(res, 'Internal server error');
  }
};

const needsVendorApproval = (before = {}, after = {}) => {
  const approvalFields = ['bank_account_no', 'ifsc_code', 'bank_name', 'status', 'gst_number', 'pan_number'];
  return approvalFields.some(field => String(before[field] || '') !== String(after[field] || ''));
};

const hasSensitiveVendorField = (payload = {}) => (
  ['bank_account_no', 'ifsc_code', 'bank_name', 'status', 'gst_number', 'pan_number']
    .some(field => Object.prototype.hasOwnProperty.call(payload, field))
);

const deleteItem = (Model, opts = {}) => async (req, res) => {
  try {
    const { globalLookup = false } = opts;
    const where = { id: req.params.id };
    if (!globalLookup && req.user?.client_id) where.client_id = req.user.client_id;

    const item = await Model.findOne({ where });
    if (!item) return error(res, 'Item not found', 404);

    // Vendor: soft delete to preserve FK references from POs/assets/GRNs
    if (Model.name === 'Vendor') {
      await item.update({ status: 'INACTIVE' });
      clearCache(`master_vendor_${globalLookup ? 'global' : (req.user?.client_id || 'global')}`);
      return success(res, null, 'Deleted successfully');
    }

    await item.destroy();
    clearCache(`master_${Model.name.toLowerCase()}_${globalLookup ? 'global' : (req.user?.client_id || 'global')}`);
    return success(res, null, 'Deleted successfully');
  } catch (err) {
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      return error(res, `Cannot delete this ${Model.name} because it is being used by other records. Remove the linked assets or records first.`, 400);
    }
    return error(res, err.message || 'Internal server error');
  }
};

// Exports
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await AssetCategory.findAll({ 
      where: { 
        status: 'ACTIVE', 
        ...buildWhere(req)
      } 
    });
    
    const buildHierarchy = (items, parentId = null) => {
      return items
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          ...item.get({ plain: true }),
          id: item.id,
          name: item.category_name,
          children: buildHierarchy(items, item.id)
        }));
    };

    // Return Top-level categories primarily for standard dropdowns
    const data = categories
      .filter(c => !c.parent_id)
      .map(c => ({
        ...c.get({ plain: true }),
        id: c.id,
        name: c.category_name,
        children: buildHierarchy(categories, c.id)
      }));

      return success(res, data);
    } catch (err) {
      return success(res, []);
    }
  };
exports.getCategoryById = getById(AssetCategory);
exports.createCategory = createItem(AssetCategory);
exports.updateCategory = updateItem(AssetCategory);
exports.deleteCategory = deleteItem(AssetCategory);

exports.getAllSubCategories = async (req, res) => {
  try {
    const parentWhere = {
      status: 'ACTIVE',
      ...buildWhere(req),
    };
    const categories = await AssetCategory.findAll({ where: parentWhere });

    for (const category of categories) {
      const name = category.category_name || category.name || 'General';
      await AssetSubCategory.findOrCreate({
        where: {
          category_id: category.id,
          sub_category_name: `${name} - General`,
        },
        defaults: {
          category_id: category.id,
          sub_category_name: `${name} - General`,
          status: 'ACTIVE',
        },
      });
    }

    const subCategories = await AssetSubCategory.findAll({
      where: { status: 'ACTIVE' },
      include: [
        {
          model: AssetCategory,
          attributes: ['id', 'category_name'],
          where: parentWhere,
          required: true,
        },
      ],
      order: [['sub_category_name', 'ASC']],
    });

    const mappedData = subCategories.map((item) => {
      const plain = item.get({ plain: true });
      return {
        ...plain,
        id: plain.id,
        name: plain.sub_category_name,
        category_id: plain.category_id,
        category_name: plain.AssetCategory?.category_name || null,
      };
    });

    // Fallback: if sub-category master is sparse, derive from category hierarchy
    // so existing category children still appear in dependent dropdowns.
    if (mappedData.length < 3) {
      const childCategories = await AssetCategory.findAll({
        where: {
          parent_id: { [Op.ne]: null },
          status: 'ACTIVE',
          ...buildWhere(req),
        },
        include: [
          {
            model: AssetCategory,
            as: 'Parent',
            attributes: ['id', 'category_name'],
            required: false,
          },
        ],
      });

      const existingKeys = new Set(mappedData.map((r) => `${r.category_id}:${String(r.name).toLowerCase()}`));
      for (const cat of childCategories) {
        const plain = cat.get({ plain: true });
        const key = `${plain.parent_id}:${String(plain.category_name || '').toLowerCase()}`;
        if (existingKeys.has(key)) continue;
        mappedData.push({
          id: `cat-child-${plain.id}`,
          name: plain.category_name,
          sub_category_name: plain.category_name,
          category_id: plain.parent_id,
          category_name: plain.Parent?.category_name || null,
          status: plain.status,
          synthetic: true,
        });
      }
    }

    return success(res, mappedData);
  } catch (err) {
    return success(res, []);
  }
};
exports.getSubCategoryById = getById(AssetSubCategory);

// CR-DEP-P3 (D1): the sub-category is the authoritative depreciation-config level.
// Every sub-category MUST define Companies Act (life, method, residual%) + IT Act (block, rate).
// Fail closed — the generic createItem/updateItem spread req.body with no validation.
const _depConfigError = (res, missing) => error(
  res,
  `Depreciation configuration required. Missing/invalid: ${missing.join(', ')}. ` +
  `Every asset sub-category must define Companies Act useful life, method (SLM/WDV), ` +
  `residual % (0-5), and IT Act block + rate.`,
  400
);

exports.createSubCategory = async (req, res) => {
  try {
    const missing = missingFields(req.body);
    if (missing.length) return _depConfigError(res, missing);

    const payload = { ...req.body };
    if (req.user?.client_id) payload.client_id = req.user.client_id;
    const data = await AssetSubCategory.create(payload);
    clearCache(`master_assetsubcategory_${req.user?.client_id || 'global'}`);
    return success(res, data, 'AssetSubCategory created successfully');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return error(res, 'This record already exists.', 400);
    if (err.name === 'SequelizeValidationError') return error(res, err.errors[0].message, 400);
    return error(res, 'Internal server error');
  }
};

exports.updateSubCategory = async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.user?.client_id) {
      // sub-categories have no client_id column — scope via parent category ownership
      const parents = await AssetCategory.findAll({ where: buildWhere(req), attributes: ['id'] });
      where.category_id = { [Op.in]: parents.map((c) => c.id) };
    }
    const item = await AssetSubCategory.findOne({ where });
    if (!item) return error(res, 'Item not found', 404);

    // Validate the MERGED result so a partial edit that leaves config intact still passes,
    // but a field cannot be blanked to break an existing complete config.
    const merged = { ...item.get({ plain: true }), ...req.body };
    const missing = missingFields(merged);
    if (missing.length) return _depConfigError(res, missing);

    await item.update(req.body);
    clearCache(`master_assetsubcategory_${req.user?.client_id || 'global'}`);
    return success(res, item, 'AssetSubCategory updated successfully');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return error(res, 'This record already exists.', 400);
    return error(res, 'Internal server error');
  }
};

exports.deleteSubCategory = deleteItem(AssetSubCategory);

// CR-DEP-P3: read-only audit — sub-categories in the caller's tenant that are NOT
// configured for depreciation (so finance can complete the master before enabling
// stricter engine behaviour in Phase 2). Tenant-scoped via parent category ownership.
exports.getDepreciationGaps = async (req, res) => {
  try {
    const categories = await AssetCategory.findAll({ where: buildWhere(req), attributes: ['id', 'category_name'] });
    const catIds = categories.map((c) => c.id);
    const catName = Object.fromEntries(categories.map((c) => [c.id, c.category_name]));

    const subs = catIds.length
      ? await AssetSubCategory.findAll({ where: { category_id: { [Op.in]: catIds } } })
      : [];

    const gaps = subs
      .map((s) => ({ sub: s.get({ plain: true }), missing: missingFields(s) }))
      .filter((r) => r.missing.length)
      .map((r) => ({
        id: r.sub.id,
        sub_category_name: r.sub.sub_category_name,
        category_id: r.sub.category_id,
        category_name: catName[r.sub.category_id] || null,
        missing: r.missing,
      }));

    return success(res, {
      total_sub_categories: subs.length,
      configured: subs.length - gaps.length,
      unconfigured: gaps.length,
      gaps,
    });
  } catch (err) {
    return error(res, 'Internal server error');
  }
};

exports.getAllDepartments = getAll(Department, 'dept_name');
exports.getDepartmentById = getById(Department);
exports.createDepartment = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (req.user?.client_id) payload.client_id = req.user.client_id;

    // Auto-generate dept_code if not provided
    if (!payload.dept_code || !String(payload.dept_code).trim()) {
      const base = String(payload.dept_name || 'DEPT')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 6)
        .toUpperCase();
      payload.dept_code = base + Math.random().toString(36).substr(2, 4).toUpperCase();
    }

    const data = await Department.create(payload);
    clearCache(`master_${Department.name.toLowerCase()}_${req.user?.client_id || 'global'}`);
    return success(res, data, 'Department created successfully');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return error(res, 'A department with this code already exists. Please use a different code.', 400);
    }
    if (err.name === 'SequelizeValidationError') {
      return error(res, err.errors[0].message, 400);
    }
    return error(res, 'Internal server error');
  }
};
exports.updateDepartment = updateItem(Department);
exports.deleteDepartment = deleteItem(Department);

exports.getAllSubDepartments = async (req, res) => {
  try {
    const parentWhere = {
      status: 'ACTIVE',
      ...buildWhere(req),
    };

    if (req.query?.department_id) {
      parentWhere.id = req.query.department_id;
    }

    const departments = await Department.findAll({ where: parentWhere });
    for (const department of departments) {
      const name = department.dept_name || department.name || 'General';
      await SubDepartment.findOrCreate({
        where: {
          department_id: department.id,
          sub_dept_name: `${name} - General`,
        },
        defaults: {
          department_id: department.id,
          sub_dept_name: `${name} - General`,
          status: 'ACTIVE',
        },
      });
    }

    const rows = await SubDepartment.findAll({
      where: { status: 'ACTIVE' },
      include: [
        {
          model: Department,
          attributes: ['id', 'dept_name'],
          where: parentWhere,
          required: true,
        },
      ],
      order: [['sub_dept_name', 'ASC']],
    });

    const data = rows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        ...plain,
        id: plain.id,
        name: plain.sub_dept_name,
        department_name: plain.Department?.dept_name || null,
      };
    });

    return success(res, data);
  } catch (err) {
    return success(res, []);
  }
};
exports.getSubDepartmentById = getById(SubDepartment);
exports.createSubDepartment = createItem(SubDepartment);
exports.updateSubDepartment = updateItem(SubDepartment);
exports.deleteSubDepartment = deleteItem(SubDepartment);

exports.getAllAssetStatuses = getAll(AssetStatus, 'status_name', { globalLookup: true });
exports.getAssetStatusById = getById(AssetStatus, { globalLookup: true });
exports.createAssetStatus = createItem(AssetStatus, { globalLookup: true });
exports.updateAssetStatus = updateItem(AssetStatus, { globalLookup: true });
exports.deleteAssetStatus = deleteItem(AssetStatus, { globalLookup: true });

exports.getAllAssetTypes = getAll(AssetType, 'type_name', { globalLookup: true });
exports.getAssetTypeById = getById(AssetType, { globalLookup: true });
exports.createAssetType = createItem(AssetType, { globalLookup: true });
exports.updateAssetType = updateItem(AssetType, { globalLookup: true });
exports.deleteAssetType = deleteItem(AssetType, { globalLookup: true });

// ─── Compliance verification of vendor-submitted details ─────────────────────
// Only the Compliance Team (and company admins) may approve or reject; the status can't be set
// through ordinary create/edit, and changing the vendor's identity or bank details puts it back
// to PENDING so it must be verified again.
const COMPLIANCE_TEAM_ROLES = ['COMPLIANCE', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'];
const VERIFICATION_FIELDS = ['verification_status', 'verified_by', 'verified_at', 'verification_remarks'];
const VERIFIED_DETAIL_FIELDS = ['vendor_name', 'gst_number', 'pan_number', 'bank_name', 'bank_account_no', 'ifsc_code'];
const REVERIFY = { verification_status: 'PENDING', verified_by: null, verified_at: null, verification_remarks: null };
const withoutVerification = (body = {}) => {
  const copy = { ...body };
  VERIFICATION_FIELDS.forEach((f) => { delete copy[f]; });
  return copy;
};
const verifiedDetailsChanged = (before, update) => VERIFIED_DETAIL_FIELDS.some((f) =>
  Object.prototype.hasOwnProperty.call(update, f) && String(update[f] ?? '').trim() !== String(before[f] ?? '').trim());
const isComplianceTeam = (role) => COMPLIANCE_TEAM_ROLES.includes(String(role || '').toUpperCase().replace(/\s+/g, '_'));

exports.getAllVendors = async (req, res) => {
  try {
    const where = { ...buildWhere(req), status: { [Op.ne]: 'INACTIVE' } };
    if (String(req.user?.role || '').toUpperCase() === 'VENDOR') {
      const owner = await User.findByPk(req.user.id, { attributes: ['vendor_id'] });
      if (!owner?.vendor_id) return res.json({ success: true, data: [] });
      where.id = owner.vendor_id;
    }
    const data = await Vendor.findAll({ where, include: [{ model: User, as: 'Verifier', attributes: ['id', 'first_name', 'last_name', 'email'], required: false }] });
    return res.json({ success: true, data });
  } catch (err) {
    return error(res, err.message || 'Failed to fetch vendors');
  }
};
exports.getVendorById = getById(Vendor);
exports.createVendor = async (req, res) => {
  try {
    const payload = { ...withoutVerification(req.body), client_id: req.user?.client_id || req.body.client_id || 1 };
    const data = await Vendor.create(payload);
    const GSTService = require('../services/GSTService');
    GSTService.validateVendorGSTIN(data.gst_number, payload.client_id).then(async (gstResult) => {
      await data.update({
        gstin_status: gstResult.valid ? 'VALID' : 'INVALID_FORMAT',
        gstin_validated_at: new Date()
      });
    }).catch(() => {
      // Non-blocking GST validation should never fail vendor creation flow.
    });
    clearCache(`master_vendor_${req.user?.client_id || 'global'}`);
    await VendorRiskHistory.create({
      client_id: payload.client_id,
      vendor_id: data.id,
      event_type: 'VENDOR_UPDATED',
      summary: 'Vendor master created',
      details_json: { vendor_code: data.vendor_code, status: data.status },
      created_by: req.user?.id || null
    }).catch(() => {});
    return success(res, data, 'Vendor created successfully');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return error(res, 'This vendor already exists.', 400);
    return error(res, err.message || 'Internal server error');
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const where = { id: req.params.id, ...buildWhere(req) };
    const item = await Vendor.findOne({ where });
    if (!item) return error(res, 'Vendor not found', 404);
    const before = item.get({ plain: true });
    const body = withoutVerification(req.body);
    const candidateAfter = { ...before, ...body };
    clearCache(`master_vendor_${req.user?.client_id || 'global'}`);

    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const requiresApproval = !isSuperAdmin && needsVendorApproval(before, candidateAfter);

    if (!requiresApproval) {
      await item.update(verifiedDetailsChanged(before, body) ? { ...body, ...REVERIFY } : body);
      clearCache(`master_vendor_${item.client_id || 'global'}`);
      clearCache('master_vendor_global');
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'gst_number')) {
      const GSTService = require('../services/GSTService');
      GSTService.validateVendorGSTIN(req.body.gst_number, item.client_id).then(async (gstResult) => {
        await item.update({
          gstin_status: gstResult.valid ? 'VALID' : 'INVALID_FORMAT',
          gstin_validated_at: new Date()
        });
      }).catch(() => {
        // Non-blocking GST validation should never fail vendor update flow.
      });
    }
    const after = requiresApproval ? candidateAfter : item.get({ plain: true });
    await VendorRiskHistory.create({
      client_id: after.client_id,
      vendor_id: item.id,
      event_type: requiresApproval ? 'APPROVAL_SUBMITTED' : 'VENDOR_UPDATED',
      old_band: before.compliance_risk_band,
      new_band: after.compliance_risk_band,
      old_score: before.compliance_risk_score,
      new_score: after.compliance_risk_score,
      summary: requiresApproval ? 'Sensitive vendor change submitted for approval' : 'Vendor master updated',
      details_json: { before, after, requires_approval: requiresApproval },
      created_by: req.user?.id || null
    }).catch(() => {});

    if (requiresApproval) {
      await VendorChangeRequest.create({
        client_id: before.client_id,
        vendor_id: item.id,
        before_json: before,
        after_json: body,
        requested_by: req.user?.id || null,
        status: 'PENDING'
      });
      await writeApprovalLog({
        module: 'VENDOR', reference_id: item.id, user_id: req.user?.id || 1,
        action: 'SUBMITTED', status: 'SUBMITTED',
        client_id: before.client_id, workflow_id: null,
        comments: 'Sensitive vendor master change requires approval'
      }).catch(() => {});
    }

    return success(res, { ...after, approval_required: requiresApproval }, requiresApproval ? 'Vendor updated and approval workflow logged' : 'Vendor updated successfully');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return error(res, 'This vendor already exists.', 400);
    return error(res, err.message || 'Internal server error');
  }
};
exports.deleteVendor = deleteItem(Vendor);

/** PUT /masters/vendors/:id/verification { decision: 'APPROVE' | 'REJECT', remarks } — Compliance Team only. */
exports.verifyVendor = async (req, res) => {
  try {
    if (!isComplianceTeam(req.user?.role)) return error(res, 'Only the Compliance Team can verify vendor details.', 403);
    const decision = String(req.body.decision || '').toUpperCase();
    if (!['APPROVE', 'REJECT'].includes(decision)) return error(res, 'Use decision APPROVE or REJECT', 400);
    const remarks = String(req.body.remarks || '').trim().slice(0, 500);
    if (decision === 'REJECT' && !remarks) return error(res, 'Enter the reason for rejecting', 400);

    const vendor = await Vendor.findOne({ where: { id: req.params.id, ...buildWhere(req) } });
    if (!vendor) return error(res, 'Vendor not found', 404);
    if (decision === 'APPROVE' && !vendor.gst_number && !vendor.pan_number) {
      return error(res, 'The vendor has not submitted a GSTIN or PAN yet, so there is nothing to verify.', 400);
    }
    const pending = await VendorChangeRequest.count({ where: { vendor_id: vendor.id, status: 'PENDING' } });
    if (decision === 'APPROVE' && pending) {
      return error(res, 'This vendor has changes waiting in Vendor Change Approvals. Decide those first, then verify.', 409);
    }

    const before = vendor.verification_status;
    await vendor.update({
      verification_status: decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED',
      verified_by: req.user?.id || null,
      verified_at: new Date(),
      verification_remarks: remarks || null
    });
    await writeApprovalLog({
      module: 'VENDOR', reference_id: vendor.id, user_id: req.user?.id || 1,
      action: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      client_id: vendor.client_id, workflow_id: null,
      comments: `Compliance verification${remarks ? `: ${remarks}` : ''}`
    }).catch(() => {});
    await VendorRiskHistory.create({
      client_id: vendor.client_id,
      vendor_id: vendor.id,
      event_type: decision === 'APPROVE' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
      summary: decision === 'APPROVE' ? 'Vendor details verified by Compliance' : 'Vendor details rejected by Compliance',
      details_json: { from: before, to: vendor.verification_status, remarks: remarks || null },
      created_by: req.user?.id || null
    }).catch(() => {});
    clearCache(`master_vendor_${vendor.client_id || 'global'}`);
    return success(res, vendor, decision === 'APPROVE' ? 'Vendor verified' : 'Vendor verification rejected');
  } catch (err) {
    return error(res, err.message || 'Failed to verify vendor');
  }
};

exports.getVendorAssets = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const rows = await VendorAsset.findAll({
      where: { vendor_id: vendorId, ...buildWhere(req) },
      include: [{ model: Asset, as: 'asset', attributes: ['id', 'asset_name', 'asset_code'] }]
    });
    return success(res, rows.map(r => ({
      id: r.id,
      asset_id: r.asset_id,
      asset_name: r.asset?.asset_name || r.asset_name || ''
    })));
  } catch (err) {
    return error(res, err.message || 'Failed to fetch vendor assets');
  }
};

exports.updateVendorAssets = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const { asset_ids } = req.body; // array of asset IDs
    // The vendor and every linked asset must belong to the caller's company.
    const vendor = await Vendor.findOne({ where: { id: vendorId, ...buildWhere(req) }, attributes: ['id', 'client_id'] });
    if (!vendor) return error(res, 'Vendor not found', 404);
    const clientId = vendor.client_id;
    const ids = Array.isArray(asset_ids) ? asset_ids : [];
    const assetRows = ids.length
      ? await Asset.findAll({ where: { id: ids, client_id: clientId }, attributes: ['id', 'asset_name'] })
      : [];
    if (assetRows.length !== new Set(ids.map(String)).size) {
      return error(res, 'Some assets were not found', 400);
    }

    // Delete existing associations for this vendor
    await VendorAsset.destroy({ where: { vendor_id: vendorId, client_id: clientId } });

    // Create new associations
    if (ids.length > 0) {
      const assetMap = {};
      assetRows.forEach(a => { assetMap[a.id] = a.asset_name; });

      const records = ids.map(aid => ({
        vendor_id: vendorId,
        asset_id: aid,
        asset_name: assetMap[aid] || '',
        client_id: clientId
      }));
      await VendorAsset.bulkCreate(records);
    }

    return success(res, { message: 'Vendor assets updated' });
  } catch (err) {
    return error(res, err.message || 'Failed to update vendor assets');
  }
};

const getDaysTo = (dateVal) => {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const getUrgencyBand = (days) => {
  if (days == null) return 'BLUE';
  if (days < 0) return 'RED';
  if (days <= 7) return 'RED';
  if (days <= 30) return 'ORANGE';
  if (days <= 60) return 'GOLD';
  return 'BLUE';
};

const getFinancialYearRange = (fy) => {
  const match = String(fy || '').match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const startYear = match ? Number(match[1]) : (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1);
  return {
    fy: `${startYear}-${String(startYear + 1).slice(-2)}`,
    start: new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)),
    end: new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59))
  };
};

const expiryScore = (days) => {
  if (days == null) return 12;
  if (days < 0) return 55;
  if (days <= 7) return 45;
  if (days <= 30) return 30;
  if (days <= 60) return 15;
  return 0;
};

const riskBandFromScore = (score, urgencyBand) => {
  if (urgencyBand === 'RED' || score >= 80) return 'RED';
  if (urgencyBand === 'ORANGE' || score >= 60) return 'ORANGE';
  if (urgencyBand === 'GOLD' || score >= 35) return 'GOLD';
  return 'BLUE';
};

const buildVendorComplianceRadar = async (req) => {
  const where = buildWhere(req);
  const { fy, start, end } = getFinancialYearRange(req.query?.fy);
  const vendors = await Vendor.findAll({ where });
  const clientWhere = buildWhere(req);

  const spendRows = await Invoice.findAll({
    where: {
      ...clientWhere,
      createdAt: { [Op.between]: [start, end] }
    },
    attributes: ['vendor_id', [fn('SUM', col('total_amount')), 'total_spend']],
    group: ['vendor_id'],
    raw: true
  });
  const spendByVendor = new Map(spendRows.map(row => [Number(row.vendor_id), Number(row.total_spend || 0)]));
  const totalProcurementSpend = Array.from(spendByVendor.values()).reduce((sum, value) => sum + value, 0);

  const snapshots = (vendors || []).map((v) => {
    const gstDays = getDaysTo(v.gst_expiry_date);
    const contractDays = getDaysTo(v.contract_expiry_date);
    const docDays = getDaysTo(v.compliance_docs_expiry_date);
    const bands = [gstDays, contractDays, docDays].map(getUrgencyBand);
    const urgencyBand = bands.sort((a, b) => ['BLUE', 'GOLD', 'ORANGE', 'RED'].indexOf(b) - ['BLUE', 'GOLD', 'ORANGE', 'RED'].indexOf(a))[0] || 'BLUE';
    const totalSpend = spendByVendor.get(Number(v.id)) || 0;
    const spendShare = totalProcurementSpend > 0 ? totalSpend / totalProcurementSpend : 0;
    const spendScore = totalSpend >= 5000000 || spendShare >= 0.25 ? 20 : totalSpend >= 1000000 || spendShare >= 0.1 ? 10 : 0;
    const missingDocsScore = (!v.gst_number ? 8 : 0) + (!v.pan_number ? 8 : 0);
    const rawScore = Math.max(expiryScore(gstDays), expiryScore(contractDays), expiryScore(docDays)) + spendScore + missingDocsScore + (v.status === 'BLACKLISTED' ? 50 : 0);
    const score = Math.min(100, rawScore);
    const band = riskBandFromScore(score, urgencyBand);
    const riskFlags = [];
    if (gstDays != null && gstDays <= 30) riskFlags.push(`GST expires in ${gstDays} days`);
    if (contractDays != null && contractDays <= 30) riskFlags.push(`Contract expires in ${contractDays} days`);
    if (docDays != null && docDays <= 30) riskFlags.push(`Compliance docs expire in ${docDays} days`);
    if (gstDays == null) riskFlags.push('GST expiry missing');
    if (contractDays == null) riskFlags.push('Contract expiry missing');
    if (docDays == null) riskFlags.push('Compliance docs expiry missing');
    if (spendScore > 0) riskFlags.push('Spend-linked risk uplift');
    if (v.status === 'BLACKLISTED') riskFlags.push('Vendor blacklisted');

    return {
      vendor_id: v.id,
      vendor_name: v.vendor_name,
      vendor_code: v.vendor_code,
      status: v.status,
      fy,
      compliance: {
        gst_number: v.gst_number,
        pan_number: v.pan_number,
        gst_expiry_date: v.gst_expiry_date,
        contract_expiry_date: v.contract_expiry_date,
        compliance_docs_expiry_date: v.compliance_docs_expiry_date,
        gst_days_to_expiry: gstDays,
        contract_days_to_expiry: contractDays,
        docs_days_to_expiry: docDays
      },
      risk: {
        score,
        band,
        urgency_band: urgencyBand,
        spend_score: spendScore,
        total_spend: totalSpend,
        spend_share_percent: Number((spendShare * 100).toFixed(2)),
        flags: riskFlags
      }
    };
  });

  const summary = snapshots.reduce((acc, row) => {
    acc.total_vendors += 1;
    acc.total_spend += Number(row.risk.total_spend || 0);
    acc[`${String(row.risk.band).toLowerCase()}_count`] += 1;
    return acc;
  }, { fy, total_vendors: 0, red_count: 0, orange_count: 0, gold_count: 0, blue_count: 0, total_spend: 0 });

  return { fy, date_range: { start, end }, summary, vendors: snapshots };
};

exports.getVendorComplianceSnapshot = async (req, res) => {
  try {
    const radar = await buildVendorComplianceRadar(req);
    await Promise.all(radar.vendors.map(row => Vendor.update({
      compliance_risk_score: row.risk.score,
      compliance_risk_band: row.risk.band
    }, { where: { id: row.vendor_id, ...buildWhere(req) } })));
    return success(res, radar);
  } catch (err) {
    return error(res, 'Failed to generate vendor compliance snapshot');
  }
};

exports.createVendorComplianceYearEndSnapshot = async (req, res) => {
  try {
    const radar = await buildVendorComplianceRadar(req);
    const snapshot = await VendorComplianceSnapshot.create({
      client_id: req.user?.client_id || 1,
      fy: radar.fy,
      generated_by: req.user?.id || null,
      total_vendors: radar.summary.total_vendors,
      red_count: radar.summary.red_count,
      orange_count: radar.summary.orange_count,
      gold_count: radar.summary.gold_count,
      blue_count: radar.summary.blue_count,
      total_spend: radar.summary.total_spend,
      snapshot_json: radar
    });
    return success(res, snapshot, 'Vendor compliance year-end snapshot captured');
  } catch (err) {
    return error(res, 'Failed to capture vendor compliance snapshot');
  }
};

exports.getVendorComplianceYearEndSnapshots = async (req, res) => {
  try {
    const where = buildWhere(req);
    if (req.query?.fy) where.fy = req.query.fy;
    const snapshots = await VendorComplianceSnapshot.findAll({
      where,
      order: [['snapshot_date', 'DESC']]
    });
    return success(res, snapshots);
  } catch (err) {
    return error(res, 'Failed to load vendor compliance snapshots');
  }
};

exports.getVendorDocuments = async (req, res) => {
  try {
    const docs = await VendorDocument.findAll({
      where: { vendor_id: req.params.id, ...buildWhere(req) },
      order: [['created_at', 'DESC']]
    });
    return success(res, docs);
  } catch (err) {
    return error(res, 'Failed to load vendor documents');
  }
};

exports.uploadVendorDocument = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ where: { id: req.params.id, ...buildWhere(req) } });
    if (!vendor) return error(res, 'Vendor not found', 404);
    const file = req.file;
    await require('../utils/fileStore').persistUpload(file); // keep a copy in the bucket, if configured
    const expiryDate = req.body.expiry_date || null;
    const doc = await VendorDocument.create({
      client_id: req.user?.client_id || vendor.client_id,
      vendor_id: vendor.id,
      document_type: req.body.document_type || 'OTHER',
      document_name: req.body.document_name || file?.originalname || 'Vendor Document',
      file_name: file?.originalname || null,
      file_path: file?.path || null,
      mime_type: file?.mimetype || null,
      file_size: file?.size || null,
      expiry_date: expiryDate,
      uploaded_by: req.user?.id || null,
      remarks: req.body.remarks || null
    });
    await VendorRiskHistory.create({
      client_id: doc.client_id,
      vendor_id: vendor.id,
      event_type: 'DOCUMENT_UPLOADED',
      old_band: vendor.compliance_risk_band,
      new_band: vendor.compliance_risk_band,
      old_score: vendor.compliance_risk_score,
      new_score: vendor.compliance_risk_score,
      summary: `${doc.document_type} document uploaded`,
      details_json: doc.get({ plain: true }),
      created_by: req.user?.id || null
    }).catch(() => {});
    return success(res, doc, 'Vendor document uploaded');
  } catch (err) {
    return error(res, err.message || 'Failed to upload vendor document');
  }
};

exports.getVendorRiskHistory = async (req, res) => {
  try {
    const history = await VendorRiskHistory.findAll({
      where: { vendor_id: req.params.id, ...buildWhere(req) },
      order: [['created_at', 'DESC']]
    });
    return success(res, history);
  } catch (err) {
    return error(res, 'Failed to load vendor risk history');
  }
};

exports.getVendorChangeRequests = async (req, res) => {
  try {
    const where = { ...buildWhere(req) };
    if (req.query?.status) where.status = req.query.status;
    if (req.params?.id) where.vendor_id = req.params.id;
    const requests = await VendorChangeRequest.findAll({
      where,
      include: [{ model: Vendor, attributes: ['id', 'vendor_name', 'vendor_code'] }],
      order: [['created_at', 'DESC']]
    });
    return success(res, requests);
  } catch (err) {
    return error(res, 'Failed to load vendor approvals');
  }
};

exports.decideVendorChangeRequest = async (req, res) => {
  try {
    const action = String(req.body.action || '').toUpperCase();
    if (!['APPROVE', 'REJECT'].includes(action)) return error(res, 'Use action APPROVE or REJECT', 400);
    const request = await VendorChangeRequest.findOne({ where: { id: req.params.requestId, ...buildWhere(req) } });
    if (!request) return error(res, 'Vendor change request not found', 404);
    if (request.status !== 'PENDING') return error(res, 'Vendor change request is already decided', 400);

    const vendor = await Vendor.findOne({ where: { id: request.vendor_id, ...buildWhere(req) } });
    if (!vendor) return error(res, 'Vendor not found', 404);

    if (action === 'APPROVE') {
      let updateData = request.after_json || {};
      if (typeof updateData === 'string') {
        try {
          updateData = JSON.parse(updateData);
        } catch (e) {
          // JSON parse failed — updateData stays as-is
        }
      }
      updateData = withoutVerification(updateData);
      await vendor.update(verifiedDetailsChanged(vendor.get({ plain: true }), updateData) ? { ...updateData, ...REVERIFY } : updateData);
      
      // Trigger GST validation after approval if gst_number was changed
      if (updateData.gst_number) {
        const GSTService = require('../services/GSTService');
        GSTService.validateVendorGSTIN(updateData.gst_number, vendor.client_id).then(async (gstResult) => {
          await vendor.update({
            gstin_status: gstResult.valid ? 'VALID' : 'INVALID_FORMAT',
            gstin_validated_at: new Date()
          });
        }).catch(() => {});
      }
    }
    await request.update({
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      approved_by: req.user?.id || null,
      approved_at: new Date(),
      decision_notes: req.body.comments || null
    });
    await writeApprovalLog({
      module: 'VENDOR', reference_id: vendor.id, user_id: req.user?.id || 1,
      action: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      client_id: vendor.client_id, workflow_id: null,
      comments: req.body.comments || null
    }).catch(() => {});
    await VendorRiskHistory.create({
      client_id: vendor.client_id,
      vendor_id: vendor.id,
      event_type: action === 'APPROVE' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
      summary: action === 'APPROVE' ? 'Vendor change approved and applied' : 'Vendor change rejected',
      details_json: request.get({ plain: true }),
      created_by: req.user?.id || null
    }).catch(() => {});
    clearCache(`master_vendor_${vendor.client_id || 'global'}`);
    clearCache('master_vendor_global');
    return success(res, request, action === 'APPROVE' ? 'Vendor change approved' : 'Vendor change rejected');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return error(res, 'Update failed: A vendor with this PAN or code already exists.', 400);
    }
    return error(res, err.message || 'Failed to decide vendor change');
  }
};

exports.generateVendorComplianceReminders = async (req, res) => {
  try {
    const days = Number(req.body.days || req.query.days || 30);
    const radar = await buildVendorComplianceRadar(req);
    const dueVendors = radar.vendors.filter(row => ['RED', 'ORANGE', 'GOLD'].includes(row.risk.band));
    const created = [];

    for (const row of dueVendors) {
      const severity = row.risk.band === 'RED' ? 'CRITICAL' : row.risk.band === 'ORANGE' ? 'HIGH' : 'MEDIUM';
      const title = `Vendor compliance ${row.risk.band}: ${row.vendor_name}`;
      const description = (row.risk.flags || []).join('; ') || `Compliance item due within ${days} days`;
      const existing = await Alert.findOne({
        where: {
          source_module: 'SYSTEM',
          alert_type: 'SYSTEM',
          reference_id: row.vendor_id,
          title,
          status: { [Op.ne]: 'RESOLVED' }
        }
      });
      if (existing) continue;
      const alert = await Alert.create({
        alert_type: 'SYSTEM',
        severity,
        source_module: 'SYSTEM',
        reference_id: row.vendor_id,
        title,
        description,
        created_by: req.user?.id || null,
        due_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      });
      created.push(alert);
      await VendorRiskHistory.create({
        client_id: req.user?.client_id || 1,
        vendor_id: row.vendor_id,
        event_type: 'REMINDER_CREATED',
        old_band: row.risk.band,
        new_band: row.risk.band,
        old_score: row.risk.score,
        new_score: row.risk.score,
        summary: title,
        details_json: { alert_id: alert.id, flags: row.risk.flags },
        created_by: req.user?.id || null
      }).catch(() => {});
    }

    return success(res, { created_count: created.length, reminders: created }, 'Vendor compliance reminders generated');
  } catch (err) {
    return error(res, 'Failed to generate vendor compliance reminders');
  }
};

exports.getVendorRiskInsights = async (req, res) => {
  try {
    const VendorInsightsService = require('../services/VendorInsightsService');
    const insights = await VendorInsightsService.generateInsights(req.user?.client_id || null);
    return success(res, insights);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load vendor risk insights' });
  }
};

exports.getVendorComplianceDashboard = async (req, res) => {
  try {
    try {
      const VendorComplianceService = require('../services/VendorComplianceService');
      await VendorComplianceService.runAllVendorChecks(req.user?.client_id || null);
    } catch (svcErr) {
      // runAllVendorChecks failed — continue with stale scores
    }
    const vendors = await Vendor.findAll({ where: buildWhere(req), order: [['compliance_score', 'ASC']] });
    const grouped = { high: [], medium: [], low: [] };
    for (const v of vendors) {
      const row = v.get({ plain: true });
      const score = Number(row.compliance_score ?? 100);
      if (score < 50) grouped.high.push(row);
      else if (score <= 80) grouped.medium.push(row);
      else grouped.low.push(row);
    }
    return success(res, grouped);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load vendor compliance dashboard' });
  }
};

const GLOBAL = { globalLookup: true };

exports.getAllUnits = getAll(Unit, 'name', GLOBAL);
exports.getUnitById = getById(Unit);
exports.createUnit = createItem(Unit, GLOBAL);
exports.updateUnit = updateItem(Unit, GLOBAL);
exports.deleteUnit = deleteItem(Unit, GLOBAL);

exports.getAllLocations = async (req, res) => {
  try {
    const locations = await Location.findAll({ 
      where: { 
        status: 'ACTIVE', 
        ...buildWhere(req)
      } 
    });
    
    // Build full tree
    const buildHierarchy = (items, parentId = null) => {
      return items
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          ...item.get({ plain: true }),
          id: item.id,
          name: item.location_name,
          children: buildHierarchy(items, item.id)
        }));
    };

    // For backward compatibility, return top-level flat but with children nested
    const data = locations
      .filter(l => !l.parent_id)
      .map(l => ({
        ...l.get({ plain: true }),
        id: l.id,
        name: l.location_name,
        children: buildHierarchy(locations, l.id)
      }));

        return success(res, data);
    } catch (err) {
      return success(res, []);
    }
};
exports.getLocationById = getById(Location);
exports.createLocation = createItem(Location);
exports.updateLocation = updateItem(Location);
exports.deleteLocation = deleteItem(Location);

exports.getAllProperties = getAll(Property, 'property_name');
exports.getPropertyById = getById(Property);
exports.createProperty = createItem(Property);
exports.updateProperty = updateItem(Property);
exports.deleteProperty = deleteItem(Property);

exports.getAllMaintenanceTypes = getAll(MaintenanceType, 'name', GLOBAL);
exports.getMaintenanceTypeById = getById(MaintenanceType);
exports.createMaintenanceType = createItem(MaintenanceType, GLOBAL);
exports.updateMaintenanceType = updateItem(MaintenanceType, GLOBAL);
exports.deleteMaintenanceType = deleteItem(MaintenanceType, GLOBAL);

exports.getAllRoles = getAll(Role, 'name', GLOBAL);

exports.getAllRegions = getAll(Region, 'region_name', GLOBAL);
exports.getRegionById = getById(Region);
exports.createRegion = createItem(Region, GLOBAL);
exports.updateRegion = updateItem(Region, GLOBAL);
exports.deleteRegion = deleteItem(Region, GLOBAL);

exports.getAllPropertyTypes = getAll(PropertyType, 'type_name', GLOBAL);
exports.getPropertyTypeById = getById(PropertyType);
exports.createPropertyType = createItem(PropertyType, GLOBAL);
exports.updatePropertyType = updateItem(PropertyType, GLOBAL);
exports.deletePropertyType = deleteItem(PropertyType, GLOBAL);

exports.getAllServiceProviders = getAll(ServiceProvider, 'provider_name', { globalLookup: true });
exports.getServiceProviderById = getById(ServiceProvider, { globalLookup: true });
exports.createServiceProvider = createItem(ServiceProvider, { globalLookup: true });
exports.updateServiceProvider = updateItem(ServiceProvider, { globalLookup: true });
exports.deleteServiceProvider = deleteItem(ServiceProvider, { globalLookup: true });

// Phase A - tenant-readable entities for the PR/PO buying-entity dropdown.
// Returns the tenant's own entities plus global/shared entities (client_id IS NULL).
// PROVIDER_ADMIN (no client_id) sees all. Fixes the /masters/entities 404.
exports.getEntities = async (req, res) => {
  try {
    const clientId = req.user && req.user.client_id ? req.user.client_id : null;
    const where = clientId ? { [Op.or]: [{ client_id: clientId }, { client_id: null }] } : {};
    const data = await Entity.findAll({ where, order: [['entity_name', 'ASC']] });
    const mapped = (data || []).map((e) => {
      const plain = e.get({ plain: true });
      return { ...plain, id: e.id, name: plain.entity_name };
    });
    return success(res, mapped);
  } catch (err) {
    return success(res, []);
  }
};

// POST /masters/entities  (tenant-scoped create)
exports.createEntity = async (req, res) => {
  try {
    const clientId = req.user && req.user.client_id ? req.user.client_id : (req.body.client_id || null);
    const entity_name = String(req.body.entity_name || '').trim();
    if (!entity_name) return error(res, 'Entity name is required', 400);
    const entity = await Entity.create({
      entity_name,
      entity_code: req.body.entity_code ? String(req.body.entity_code).trim() : null,
      short_code: req.body.short_code ? String(req.body.short_code).trim().toUpperCase() : null,
      gst_number: req.body.gst_number ? String(req.body.gst_number).trim() : null,
      address: req.body.address || null,
      client_id: clientId
    });
    return success(res, { ...entity.get({ plain: true }), name: entity.entity_name }, 'Entity created');
  } catch (err) {
    if (err && err.name === 'SequelizeUniqueConstraintError') return error(res, 'Entity code already exists', 400);
    return error(res, (err && err.message) || 'Failed to create entity', 400);
  }
};

// ---- Phase B: Entity GST registrations (entity x state GSTIN) ----
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// GET /masters/entities/:id/gst  -> all registrations for one entity (tenant-scoped)
exports.getEntityGst = async (req, res) => {
  try {
    const clientId = req.user && req.user.client_id ? req.user.client_id : null;
    const where = { entity_id: req.params.id };
    if (clientId) where.client_id = clientId;
    const data = await EntityGstRegistration.findAll({ where, order: [['state_code', 'ASC'], ['taxpayer_type', 'ASC']] });
    return success(res, data);
  } catch (err) {
    return success(res, []);
  }
};

// POST /masters/entities/:id/gst  (tenant-scoped create)
exports.createEntityGst = async (req, res) => {
  try {
    const clientId = req.user && req.user.client_id ? req.user.client_id : (req.body.client_id || null);
    const gstin = String(req.body.gstin || '').trim().toUpperCase();
    if (!GSTIN_RE.test(gstin)) return error(res, 'Invalid GSTIN format', 400);
    const status = (req.body.status || 'ACTIVE').toUpperCase();
    const data = await EntityGstRegistration.create({
      client_id: clientId,
      entity_id: req.params.id,
      gstin,
      state_code: gstin.slice(0, 2),
      state_name: req.body.state_name || null,
      pan: req.body.pan || gstin.slice(2, 12),
      taxpayer_type: (req.body.taxpayer_type || 'REGULAR').toUpperCase(),
      reg_date: req.body.reg_date || null,
      status,
      is_active: status === 'ACTIVE'
    });
    return success(res, data, 'GST registration added');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return error(res, 'This GSTIN already exists.', 400);
    return error(res, 'Internal server error');
  }
};

// PUT /masters/entity-gst/:regId  (tenant-scoped update)
exports.updateEntityGst = async (req, res) => {
  try {
    const clientId = req.user && req.user.client_id ? req.user.client_id : null;
    const where = { id: req.params.regId };
    if (clientId) where.client_id = clientId;
    const row = await EntityGstRegistration.findOne({ where });
    if (!row) return error(res, 'Registration not found', 404);
    const patch = { ...req.body };
    if (patch.gstin) {
      patch.gstin = String(patch.gstin).trim().toUpperCase();
      if (!GSTIN_RE.test(patch.gstin)) return error(res, 'Invalid GSTIN format', 400);
      patch.state_code = patch.gstin.slice(0, 2);
    }
    if (patch.status) { patch.status = String(patch.status).toUpperCase(); patch.is_active = patch.status === 'ACTIVE'; }
    if (patch.taxpayer_type) patch.taxpayer_type = String(patch.taxpayer_type).toUpperCase();
    delete patch.client_id; delete patch.entity_id; // immutable scope
    await row.update(patch);
    return success(res, row, 'GST registration updated');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return error(res, 'This GSTIN already exists.', 400);
    return error(res, 'Internal server error');
  }
};

// DELETE /masters/entity-gst/:regId  (tenant-scoped delete)
exports.deleteEntityGst = async (req, res) => {
  try {
    const clientId = req.user && req.user.client_id ? req.user.client_id : null;
    const where = { id: req.params.regId };
    if (clientId) where.client_id = clientId;
    const row = await EntityGstRegistration.findOne({ where });
    if (!row) return error(res, 'Registration not found', 404);
    await row.destroy();
    return success(res, {}, 'GST registration deleted');
  } catch (err) {
    return error(res, 'Internal server error');
  }
};

// Phase A/B — update a tenant's entity master (name, registered address, primary GSTIN).
// Address flows into the PO "Bill To". Tenant-scoped; PROVIDER_ADMIN may edit any.
exports.updateEntity = async (req, res) => {
  try {
    const clientId = req.user && req.user.client_id ? req.user.client_id : null;
    const where = { id: req.params.id };
    if (clientId) where.client_id = clientId;
    const ent = await Entity.findOne({ where });
    if (!ent) return error(res, 'Entity not found', 404);
    const patch = {};
    ['entity_name', 'address', 'gst_number'].forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    if (req.body.short_code !== undefined) patch.short_code = req.body.short_code ? String(req.body.short_code).trim().toUpperCase() : null;
    await ent.update(patch);
    return success(res, ent, 'Entity updated');
  } catch (err) {
    return error(res, 'Internal server error');
  }
};
