const { Company, CompanyPolicy, UserCompanyAssignment, User } = require('../models');
const tenantFilter = require('../utils/tenantFilter');

/** Build a WHERE clause that only adds client_id when non-null (PROVIDER_ADMIN has null) */
const tenantWhere = (clientId, extra = {}) => {
  const w = { ...extra };
  if (clientId) w.client_id = clientId;
  return w;
};

/**
 * POST /api/companies
 * Create company (CLIENT_ADMIN, SUPER_ADMIN only)
 */
const createCompany = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const { company_code, company_name, company_type } = req.body;

    if (!company_code || !company_name) {
      return res.status(400).json({
        error: 'company_code and company_name are required'
      });
    }

    // Check duplicate company_code
    const existing = await Company.findOne({
      where: { company_code }
    });

    if (existing) {
      return res.status(409).json({
        error: `Company code ${company_code} already exists`
      });
    }

    const effectiveClientId = clientId || req.body.client_id;
    if (!effectiveClientId) {
      return res.status(400).json({ error: 'client_id is required' });
    }

    const company = await Company.create({
      client_id: effectiveClientId,
      company_code,
      company_name,
      company_type: company_type || 'LIMITED_LIABILITY',
      address_line_1: req.body.address_line_1,
      city: req.body.city,
      state: req.body.state,
      postal_code: req.body.postal_code,
      email: req.body.email,
      phone: req.body.phone,
      is_active: true,
      is_primary: false,
      created_by: req.user.id
    });

    // Create default policies
    await CompanyPolicy.create({
      company_id: company.id,
      client_id: effectiveClientId
    });

    return res.status(201).json(company);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create company' });
  }
};

/**
 * GET /api/companies
 * List all companies for client
 */
const listCompanies = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const isActive = req.query.is_active === 'true' ? true : undefined;

    const where = {};
    if (clientId) where.client_id = clientId;
    if (isActive !== undefined) where.is_active = isActive;

    const companies = await Company.findAll({
      where,
      order: [['is_primary', 'DESC'], ['created_at', 'ASC']]
    });

    return res.json(companies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list companies' });
  }
};

/**
 * GET /api/companies/:id
 * Get company detail
 */
const getCompany = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const companyId = parseInt(req.params.id, 10);

    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const where = { id: companyId };
    if (clientId) where.client_id = clientId;

    const company = await Company.findOne({ where });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    return res.json(company);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get company' });
  }
};

/**
 * PUT /api/companies/:id
 * Update company
 */
const updateCompany = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const companyId = parseInt(req.params.id, 10);

    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const company = await Company.findOne({ where: tenantWhere(clientId, { id: companyId }) });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Prevent updating certain fields
    const { id, client_id, company_code, is_primary, ...updateData } = req.body;
    updateData.updated_by = req.user.id;

    await company.update(updateData);

    return res.json(company);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update company' });
  }
};

/**
 * DELETE /api/companies/:id
 * Soft-delete company
 */
const deleteCompany = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const companyId = parseInt(req.params.id, 10);

    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const company = await Company.findOne({ where: tenantWhere(clientId, { id: companyId }) });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (company.is_primary) {
      return res.status(409).json({ error: 'Cannot delete primary company' });
    }

    await company.update({
      is_active: false,
      updated_by: req.user.id
    });

    return res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete company' });
  }
};

/**
 * GET /api/companies/:id/policies
 * Get company policies
 */
const getCompanyPolicies = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const companyId = parseInt(req.params.id, 10);

    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const policies = await CompanyPolicy.findOne({ where: tenantWhere(clientId, { company_id: companyId }) });

    if (!policies) {
      return res.status(404).json({ error: 'Policies not found' });
    }

    return res.json(policies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get policies' });
  }
};

/**
 * PUT /api/companies/:id/policies
 * Update company policies
 */
const updateCompanyPolicies = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const companyId = parseInt(req.params.id, 10);

    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const policies = await CompanyPolicy.findOne({ where: tenantWhere(clientId, { company_id: companyId }) });

    if (!policies) {
      return res.status(404).json({ error: 'Policies not found' });
    }

    await policies.update(req.body);

    return res.json(policies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update policies' });
  }
};

/**
 * POST /api/companies/:id/users
 * Assign user to company
 */
const assignUserToCompany = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const companyId = parseInt(req.params.id, 10);
    const { user_id, access_level, is_primary } = req.body;

    if (isNaN(companyId) || !user_id || !access_level) {
      return res.status(400).json({
        error: 'company_id, user_id, and access_level are required'
      });
    }

    // Verify company exists
    const company = await Company.findOne({ where: tenantWhere(clientId, { id: companyId }) });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Check if already assigned
    const existing = await UserCompanyAssignment.findOne({
      where: tenantWhere(clientId, { user_id, company_id: companyId })
    });

    if (existing) {
      return res.status(409).json({ error: 'User already assigned to this company' });
    }

    // If marking as primary, unset others
    if (is_primary) {
      await UserCompanyAssignment.update(
        { is_primary: false },
        { where: tenantWhere(clientId, { user_id }) }
      );
    }

    const assignment = await UserCompanyAssignment.create({
      user_id,
      company_id: companyId,
      client_id: clientId || company.client_id,
      access_level,
      is_primary: is_primary || false
    });

    return res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign user' });
  }
};

/**
 * PUT /api/companies/:id/users/:userId
 * Update user assignment
 */
const updateUserAssignment = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const companyId = parseInt(req.params.id, 10);
    const userId = req.params.userId;

    if (isNaN(companyId) || !userId) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const assignment = await UserCompanyAssignment.findOne({
      where: tenantWhere(clientId, { user_id: userId, company_id: companyId })
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // If marking as primary, unset others
    if (req.body.is_primary === true) {
      await UserCompanyAssignment.update(
        { is_primary: false },
        { where: tenantWhere(clientId, { user_id: userId, id: { [require('sequelize').Op.ne]: assignment.id } }) }
      );
    }

    await assignment.update(req.body);

    return res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update assignment' });
  }
};

/**
 * DELETE /api/companies/:id/users/:userId
 * Remove user from company
 */
const removeUserFromCompany = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const companyId = parseInt(req.params.id, 10);
    const userId = req.params.userId;

    if (isNaN(companyId) || !userId) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const assignment = await UserCompanyAssignment.findOne({
      where: tenantWhere(clientId, { user_id: userId, company_id: companyId })
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Prevent removing from primary if only assignment
    if (assignment.is_primary) {
      const otherWhere = tenantWhere(clientId, { user_id: userId, id: { [require('sequelize').Op.ne]: assignment.id } });
      const otherCount = await UserCompanyAssignment.count({ where: otherWhere });

      if (otherCount === 0) {
        return res.status(409).json({
          error: 'Cannot remove from primary company if it is the only assignment'
        });
      }

      // Assign another as primary
      const nextAssignment = await UserCompanyAssignment.findOne({ where: otherWhere });

      if (nextAssignment) {
        await nextAssignment.update({ is_primary: true });
      }
    }

    await assignment.destroy();

    return res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove user' });
  }
};

/**
 * GET /api/companies/:id/users
 * List users assigned to company
 */
const getCompanyUsers = async (req, res) => {
  try {
    const clientId = tenantFilter.getClientId(req);
    const companyId = parseInt(req.params.id, 10);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;

    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const assignments = await UserCompanyAssignment.findAll({
      where: tenantWhere(clientId, { company_id: companyId }),
      include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'username', 'email'] }],
      limit,
      offset,
      order: [['is_primary', 'DESC'], ['created_at', 'ASC']]
    });

    return res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get users' });
  }
};

module.exports = {
  createCompany,
  listCompanies,
  getCompany,
  updateCompany,
  deleteCompany,
  getCompanyPolicies,
  updateCompanyPolicies,
  assignUserToCompany,
  updateUserAssignment,
  removeUserFromCompany,
  getCompanyUsers
};
