const { Vendor } = require('../models');
const { sendResponse } = require('../utils/response');
const AppError = require('../utils/appError');
const { buildWhere, getClientId } = require('../utils/tenantFilter');

exports.getVendors = async (req, res, next) => {
  try {
    const { Op } = require('sequelize');
    const vendors = await Vendor.findAll({
      where: { ...buildWhere(req), status: { [Op.ne]: 'INACTIVE' } }
    });
    sendResponse(res, 200, vendors, 'Vendors retrieved successfully');
  } catch (error) {
    next(error);
  }
};

exports.createVendor = async (req, res, next) => {
  try {
    const { pan_number, bank_account_no } = req.body;
    const clientId = getClientId(req);

    // Strict validation: Duplicate PAN/Bank check
    const existingPan = await Vendor.findOne({ 
      where: { pan_number, client_id: clientId } 
    });
    if (existingPan) {
      throw new AppError('Vendor with this PAN already exists', 400);
    }

    const existingBank = await Vendor.findOne({ 
      where: { bank_account_no, client_id: clientId } 
    });
    if (existingBank) {
      throw new AppError('Vendor with this Bank Account already exists', 400);
    }

    const vendor = await Vendor.create({
      ...req.body,
      client_id: clientId
    });
    sendResponse(res, 201, vendor, 'Vendor created successfully');
  } catch (error) {
    next(error);
  }
};

exports.getVendorById = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({
      where: { id: req.params.id, ...buildWhere(req) }
    });
    if (!vendor) throw new AppError('Vendor not found', 404);
    sendResponse(res, 200, vendor);
  } catch (error) {
    next(error);
  }
};

exports.updateVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({
      where: { id: req.params.id, ...buildWhere(req) }
    });
    if (!vendor) throw new AppError('Vendor not found', 404);

    await vendor.update(req.body);
    sendResponse(res, 200, vendor, 'Vendor updated successfully');
  } catch (error) {
    next(error);
  }
};

exports.deleteVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({
      where: { id: req.params.id, ...buildWhere(req) }
    });
    if (!vendor) throw new AppError('Vendor not found', 404);

    // Soft delete — preserve FK references from POs/assets/GRNs
    await vendor.update({ status: 'INACTIVE' });
    sendResponse(res, 200, null, 'Vendor deleted successfully');
  } catch (error) {
    next(error);
  }
};

exports.getComplianceDashboard = async (req, res, next) => {
  try {
    const vendors = await Vendor.findAll({
      where: buildWhere(req),
      attributes: ['id', 'vendor_name', 'compliance_score', 'compliance_risk_band', 'status', 'gstin_status']
    });

    const buckets = { high: [], medium: [], low: [] };

    for (const v of vendors) {
      const band = v.compliance_risk_band;
      const score = Number(v.compliance_score ?? 100);

      let bucket;
      if (band === 'RED' || score < 40) {
        bucket = 'high';
      } else if (band === 'ORANGE' || score < 70) {
        bucket = 'medium';
      } else {
        bucket = 'low';
      }

      buckets[bucket].push({
        id: v.id,
        vendor_name: v.vendor_name,
        compliance_score: score,
        status: v.gstin_status || v.status || '-'
      });
    }

    sendResponse(res, 200, buckets, 'Compliance dashboard loaded');
  } catch (error) {
    next(error);
  }
};

