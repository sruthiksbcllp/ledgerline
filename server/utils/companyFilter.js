'use strict';

const { Company, UserCompanyAssignment } = require('../models');

/**
 * Get company_id from request.
 * Priority: x-company-id header > query param > user's primary company
 */
const getCompanyId = async (req, queryCompanyId) => {
  // 1. Explicit header
  const headerCompanyId = req.headers['x-company-id'];
  if (headerCompanyId) return parseInt(headerCompanyId, 10);

  // 2. Explicit query param
  if (queryCompanyId) return parseInt(queryCompanyId, 10);

  // 3. Fall back to user's primary company
  const userId = req.user?.id;
  const clientId = req.user?.client_id;
  if (!userId) return null;

  const primary = await UserCompanyAssignment.findOne({
    where: { user_id: userId, is_primary: true, ...(clientId ? { client_id: clientId } : {}) }
  });

  return primary ? parseInt(primary.company_id, 10) : null;
};

/**
 * Verify user has access to a specific company
 */
const verifyCompanyAccess = async (userId, companyId, clientId) => {
  if (!companyId) return false;
  const assignment = await UserCompanyAssignment.findOne({
    where: { user_id: userId, company_id: companyId, ...(clientId ? { client_id: clientId } : {}) }
  });
  return !!assignment;
};

module.exports = { getCompanyId, verifyCompanyAccess };
