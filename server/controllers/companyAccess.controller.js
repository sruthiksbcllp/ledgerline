'use strict';

/**
 * Company Admin screens: access requests and members of the company the session is in.
 * Every query is scoped to req.user.client_id (the selected company); ids from the URL are only
 * looked up inside it.
 */
const access = require('../services/companyAccess.service');
const { Client } = require('../models');
const { ROLES, canAssignRole, TIERS } = require('../config/rbac');
const { sendSuccess, sendError } = require('../utils/response');
const ImmutableAuditService = require('../services/ImmutableAuditService');

const fail = (res, error, fallback) => {
  if (error instanceof access.AccessError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  return sendError(res, error.message || fallback, 500);
};

const audit = (req, action, entityId, afterData) => ImmutableAuditService.log({
  clientId: req.user.client_id, userId: req.user.id, action, module: 'COMPANY_ACCESS',
  entityType: 'COMPANY_MEMBERSHIP', entityId, afterData, req
});

/** GET /company-access/overview: the company, counts, and the roles this admin may assign. */
exports.overview = async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const [company, members, pending] = await Promise.all([
      Client.findByPk(clientId, { attributes: ['id', 'client_name', 'email_domain', 'created_at'] }),
      access.listMemberships(clientId, ['ACTIVE']),
      access.listMemberships(clientId, ['PENDING'])
    ]);
    const byTier = Object.fromEntries(TIERS.map((t) => [t.code, 0]));
    members.forEach((m) => { byTier[m.tier] = (byTier[m.tier] || 0) + 1; });
    const assignable = ROLES
      .filter((r) => canAssignRole(req.user.role, r.code))
      .map((r) => ({ code: r.code, name: r.name, description: r.description, ...access.tierInfo(r.code) }));
    return sendSuccess(res, {
      company: company ? { id: company.id, name: company.client_name, email_domain: company.email_domain, created_at: company.created_at } : null,
      counts: { members: members.length, pending: pending.length, by_tier: byTier },
      tiers: TIERS.filter((t) => t.code !== 'SUPER_ADMIN'),
      assignable_roles: assignable
    });
  } catch (error) {
    return fail(res, error, 'Could not load company access');
  }
};

/** GET /company-access/requests?view=pending|history */
exports.listRequests = async (req, res) => {
  try {
    const statuses = req.query.view === 'history' ? ['REJECTED', 'REVOKED'] : ['PENDING'];
    return sendSuccess(res, await access.listMemberships(req.user.client_id, statuses));
  } catch (error) {
    return fail(res, error, 'Could not load requests');
  }
};

/** POST /company-access/requests/:id/approve { role, note } */
exports.approve = async (req, res) => {
  try {
    const member = await access.decideRequest(req.user, req.user.client_id, Number(req.params.id), { approve: true, role: req.body?.role, note: req.body?.note });
    audit(req, 'APPROVE_COMPANY_ACCESS', member.id, { user_id: member.user_id, role: member.role });
    return sendSuccess(res, member, `${member.name} can now access the company as ${member.role_name}.`);
  } catch (error) {
    return fail(res, error, 'Could not approve the request');
  }
};

/** POST /company-access/requests/:id/reject { note } */
exports.reject = async (req, res) => {
  try {
    const member = await access.decideRequest(req.user, req.user.client_id, Number(req.params.id), { approve: false, note: req.body?.note });
    audit(req, 'REJECT_COMPANY_ACCESS', member.id, { user_id: member.user_id });
    return sendSuccess(res, member, 'Request rejected.');
  } catch (error) {
    return fail(res, error, 'Could not reject the request');
  }
};

/** GET /company-access/members */
exports.listMembers = async (req, res) => {
  try {
    return sendSuccess(res, await access.listMemberships(req.user.client_id, ['ACTIVE']));
  } catch (error) {
    return fail(res, error, 'Could not load members');
  }
};

/** PUT /company-access/members/:id/role { role } */
exports.changeRole = async (req, res) => {
  try {
    const result = await access.changeMemberRole(req.user, req.user.client_id, Number(req.params.id), req.body?.role);
    audit(req, 'CHANGE_COMPANY_ROLE', Number(req.params.id), result);
    return sendSuccess(res, result, 'Role updated.');
  } catch (error) {
    return fail(res, error, 'Could not change the role');
  }
};

/** DELETE /company-access/members/:id */
exports.revoke = async (req, res) => {
  try {
    await access.revokeMember(req.user, req.user.client_id, Number(req.params.id));
    audit(req, 'REVOKE_COMPANY_ACCESS', Number(req.params.id), {});
    return sendSuccess(res, {}, 'Access removed.');
  } catch (error) {
    return fail(res, error, 'Could not remove access');
  }
};

/** PUT /company-access/company { name } (the email domain is fixed; it decides who may ask to join) */
exports.renameCompany = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2 || name.length > 150) return sendError(res, 'Company name must be 2-150 characters', 400);
    const company = await Client.findByPk(req.user.client_id);
    if (!company) return sendError(res, 'Company not found', 404);
    const before = company.client_name;
    await company.update({ client_name: name });
    ImmutableAuditService.log({ clientId: company.id, userId: req.user.id, action: 'RENAME_COMPANY', module: 'COMPANY_ACCESS', entityType: 'CLIENT', entityId: company.id, beforeData: { name: before }, afterData: { name }, req });
    return sendSuccess(res, { id: company.id, name }, 'Company name updated.');
  } catch (error) {
    return fail(res, error, 'Could not rename the company');
  }
};
