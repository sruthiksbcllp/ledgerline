'use strict';
const { Employee } = require('../models');
const { getClientId } = require('../utils/tenantFilter');

// List (tenant-scoped) with optional search + server pagination.
exports.getEmployees = async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const clientId = getClientId(req);
    const where = {};
    if (clientId) where.client_id = clientId;
    const q = String(req.query.search || '').trim();
    if (q) {
      where[Op.or] = [
        { emp_code: { [Op.like]: `%${q}%` } },
        { name: { [Op.like]: `%${q}%` } },
        { sub_lob: { [Op.like]: `%${q}%` } },
        { location: { [Op.like]: `%${q}%` } }
      ];
    }
    const page = Math.max(parseInt(req.query.page || 1, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || 25, 10) || 25, 1), 200);
    const { rows, count } = await Employee.findAndCountAll({
      where, order: [['emp_code', 'ASC']], limit: pageSize, offset: (page - 1) * pageSize
    });
    res.json({ success: true, data: rows, total: count, page, pageSize });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const FIELDS = ['emp_code','name','doj','designation','location','gender','rm_emp_code','rm_name','employment_type','company','sub_lob','lob','sbu','user_id','is_active'];
const pick = (body) => { const o = {}; FIELDS.forEach(f => { if (body[f] !== undefined) o[f] = body[f]; }); return o; };

exports.createEmployee = async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, message: 'Tenant context required' });
    const body = pick(req.body);
    if (!body.emp_code || !body.name) return res.status(400).json({ success: false, message: 'emp_code and name are required' });
    const emp = await Employee.create({ ...body, client_id: clientId });
    res.status(201).json({ success: true, data: emp, message: 'Employee created' });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ success: false, message: 'Employee code already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const where = { id: req.params.id };
    if (clientId) where.client_id = clientId;
    const emp = await Employee.findOne({ where });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    await emp.update(pick(req.body));
    res.json({ success: true, data: emp, message: 'Employee updated' });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ success: false, message: 'Employee code already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const where = { id: req.params.id };
    if (clientId) where.client_id = clientId;
    const n = await Employee.destroy({ where });
    if (!n) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Bulk import (CSV/XLSX parsed client-side). Idempotent upsert by (client_id, emp_code).
exports.importEmployees = async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, message: 'Tenant context required' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: 'No rows supplied' });
    let created = 0, updated = 0, skipped = 0; const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const b = pick(rows[i]);
      const emp_code = String(b.emp_code ?? '').trim();
      if (!emp_code || !b.name) { skipped++; errors.push(`Row ${i + 1}: emp_code and name required`); continue; }
      b.emp_code = emp_code;
      if (b.doj === '' ) b.doj = null;
      const [row, isNew] = await Employee.findOrCreate({
        where: { client_id: clientId, emp_code }, defaults: { ...b, client_id: clientId }
      });
      if (isNew) created++;
      else { await row.update(b); updated++; }
    }
    res.json({ success: true, message: `Imported: ${created} created, ${updated} updated, ${skipped} skipped`, data: { created, updated, skipped, errors: errors.slice(0, 50) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
