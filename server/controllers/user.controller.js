'use strict';
const { User, Role, Entity, Property, Client, ClientLicense } = require('../models');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { fn, col, where } = require('sequelize');
const { sendSuccess, sendError } = require('../utils/response');
const { isDevAdminRole } = require('../utils/devRole');
const { canAssignRole } = require('../config/rbac');
const { recordAdminAction } = require('../utils/adminAudit');

const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
const PLATFORM_ROLES = ['PROVIDER_ADMIN', 'DEV_ADMIN', 'SUPER_ADMIN'];

const isPlatformActor = (roleCode) => PLATFORM_ROLES.includes(String(roleCode || '').toUpperCase()) || isDevAdminRole(roleCode);

const roleCodeOf = async (user) => {
  if (!user) return '';
  if (user.Role?.code) return String(user.Role.code).toUpperCase();
  const role = await Role.findByPk(user.role_id, { attributes: ['code'] });
  return String(role?.code || '').toUpperCase();
};

const parseRoleId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const publicUser = (user) => {
  const safe = user?.toJSON ? user.toJSON() : user;
  if (!safe || typeof safe !== 'object') return safe;
  delete safe.password_hash;
  delete safe.refresh_token_hash;
  delete safe.mfa_secret;
  delete safe.reset_token;
  delete safe.reset_token_expiry;
  return safe;
};

exports.getAllUsers = async (req, res) => {
  try {
    const roleCode = String(req.user?.role || '').toUpperCase();
    // SUPER_ADMIN is per-client: only provider/dev admins list users across companies.
    const isGlobalAdmin = roleCode === 'PROVIDER_ADMIN' || isDevAdminRole(roleCode);
    const isSenior = isGlobalAdmin || ['ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN'].includes(roleCode);
    const requested = String(req.query.status || 'ACTIVE').toUpperCase();
    const where = {};

    if (requested === 'ALL') {
      if (!isSenior) return sendError(res, 'You cannot view every account status', 403);
    } else if (ACCOUNT_STATUSES.includes(requested)) {
      where.status = requested;
    } else {
      where.status = 'ACTIVE';
    }

    if (!isGlobalAdmin) {
      if (!req.user?.client_id) return sendError(res, 'Tenant context missing', 403);
      where.client_id = req.user.client_id;
    }

    const users = await User.findAll({
      where,
      include: [
        {
          model: Role,
          as: 'Role',
          attributes: ['id', 'code', 'name']
        },
        { 
          model: Property, 
          attributes: ['id', 'property_name']
        },
        {
          model: Client,
          as: 'Client',
          attributes: ['id', 'client_name']
        }
      ]
    });

    return sendSuccess(res, users.map(publicUser));
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const roleCode = String(req.user?.role || '').toUpperCase();
    const isGlobalAdmin = roleCode === 'PROVIDER_ADMIN' || isDevAdminRole(roleCode);
    const user = await User.findByPk(id, {
      include: [
        { model: Role, as: 'Role', attributes: ['name', 'code'] },
        { model: Entity, attributes: ['entity_name'] },
        { model: Property, attributes: ['property_name'] },
        { model: Client, as: 'Client', attributes: ['client_name'] }
      ]
    });
    
    if (user && !isGlobalAdmin && user.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, message: 'Access denied: User belongs to another tenant' });
    }
    
    if (!user) return sendError(res, 'User not found', 404);
    
    return sendSuccess(res, publicUser(user));
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.createUser = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      employee_id,
      username,
      password,
      role_id,
      entity_id,
      property_id,
      user_level,
      status,
      client_id
    } = req.body || {};

    const normalizedRoleId = parseRoleId(role_id) || 3; // Default to REQUESTER (ID 3)

    const requiredFields = [
      { key: 'first_name', value: first_name },
      { key: 'last_name', value: last_name },
      { key: 'email', value: email },
      { key: 'employee_id', value: employee_id },
      { key: 'username', value: username },
      { key: 'password', value: password },
      { key: 'role_id', value: normalizedRoleId }
    ];
    const missing = requiredFields.filter((f) => !String(f.value || '').trim()).map((f) => f.key);
    if (missing.length > 0) {
      return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
    }
    if (!normalizedRoleId) {
      return res.status(404).json({ success: false, message: 'normalizedRoleId not found' });
    }

    const [existingByEmail, existingByUsername, role] = await Promise.all([
      User.findOne({
        where: where(fn('lower', col('email')), String(email).trim().toLowerCase())
      }),
      User.findOne({
        where: where(fn('lower', col('username')), String(username).trim().toLowerCase())
      }),
      Role.findByPk(normalizedRoleId)
    ]);

    if (existingByEmail) return sendError(res, 'Email already registered', 400);
    if (existingByUsername) return sendError(res, 'Username already taken', 400);
    if (!role) return sendError(res, 'Invalid role assigned', 400);
    if (!canAssignRole(req.user?.role, role.code)) {
      return sendError(res, 'You cannot assign this role', 403);
    }

    // SaaS License Check
    if (client_id) {
      const activeLicense = await ClientLicense.findOne({ where: { client_id, status: 'ACTIVE' }, order: [['created_at', 'DESC']] });
      if (activeLicense) {
        const userCount = await User.count({ where: { client_id, status: 'ACTIVE' } });
        if (userCount >= activeLicense.max_users) {
          return sendError(res, `License limit reached: This client is allowed maximum ${activeLicense.max_users} users.`, 403);
        }
      }
    }

    const password_hash = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      email: String(email).trim().toLowerCase(),
      employee_id: String(employee_id).trim(),
      username: String(username).trim(),
      password_hash,
      role_id: normalizedRoleId,
      entity_id: entity_id || null,
      property_id: property_id || null,
      client_id: client_id || req.user.client_id || 1,
      user_level: user_level || 'Level 1',
      status: status || 'ACTIVE'
    });

    if (user.setRoles) await user.setRoles([normalizedRoleId]);
    await require('../services/companyAccess.service').syncFromUsersScreen(user.id, user.client_id, role.code);

    recordAdminAction(req, {
      action: 'USER_CREATED',
      module: 'USER',
      recordId: user.id,
      description: `Created user ${user.username} with role ${role.code}`,
      newValues: { username: user.username, role: role.code, status: user.status }
    });

    const safeUser = publicUser(user);

    // Fire-and-forget welcome email — never blocks the response
    setImmediate(async () => {
      try {
        const emailSvc = require('../services/notificationEmail.service');
        let loginUrl = process.env.CLIENT_URL || 'https://fixtag.in';
        const effectiveClientId = client_id || req.user?.client_id;
        if (effectiveClientId) {
          const clientRecord = await Client.findByPk(effectiveClientId, { attributes: ['subdomain'] });
          if (clientRecord?.subdomain) loginUrl = `https://${clientRecord.subdomain}.fixtag.in`;
        }
        await emailSvc.sendWelcomeEmail({
          firstName: String(first_name).trim(),
          lastName: String(last_name).trim(),
          email: String(email).trim().toLowerCase(),
          username: String(username).trim(),
          password: String(password),
          loginUrl,
          roleName: role?.name || 'User',
        });
      } catch { /* non-blocking — email failure must never break user creation */ }
    });

    return sendSuccess(res, safeUser, 'User created successfully', 201);
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return sendError(res, 'User not found', 404);

    // Multi-tenant Security
    const roleCode = String(req.user?.role || '').toUpperCase();
    const isGlobalAdmin = roleCode === 'PROVIDER_ADMIN' || isDevAdminRole(roleCode);
    if (!isGlobalAdmin && user.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot update user from another tenant' });
    }

    // SECURITY (FT-008): Self-update must NOT allow privilege escalation.
    // When a user edits their own profile (no admin role), strip privileged fields.
    const isSelfUpdate = String(req.user?.id) === String(id);
    const isAdmin = ['PROVIDER_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'].includes(roleCode) || isDevAdminRole(roleCode);
    const canChangeOwnRole = ['PROVIDER_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN'].includes(roleCode) || isDevAdminRole(roleCode);
    if (isSelfUpdate && !canChangeOwnRole) {
      // Only allow safe profile fields for self-update
      delete req.body.role_id;
      delete req.body.role_code;
      delete req.body.vendor_id;
      delete req.body.client_id;
      delete req.body.status;
      delete req.body.user_level;
      delete req.body.entity_id;
      delete req.body.property_id;
      delete req.body.employee_id;
    }

    const {
      first_name,
      last_name,
      email,
      employee_id,
      username,
      role_id,
      entity_id,
      user_level,
      status,
      password,
      property_id,
      client_id
    } = req.body || {};

    const hasRoleInPayload = role_id !== undefined;
    const normalizedRoleId = hasRoleInPayload ? parseRoleId(role_id) : undefined;
    const previousStatus = user.status;
    const previousRoleId = user.role_id;
    if (status !== undefined && !ACCOUNT_STATUSES.includes(String(status).toUpperCase())) {
      return sendError(res, 'Status must be Active, Inactive, or Suspended', 400);
    }
    if (String(req.user?.id) === String(id) && status !== undefined && String(status).toUpperCase() !== 'ACTIVE') {
      return sendError(res, 'You cannot deactivate or suspend your own account', 400);
    }
    const targetCode = await roleCodeOf(user);
    if (PLATFORM_ROLES.includes(targetCode) && !isPlatformActor(roleCode)) {
      return sendError(res, 'You cannot change a platform administrator account', 403);
    }

    if (hasRoleInPayload) {
      if (!normalizedRoleId) {
      return res.status(404).json({ success: false, message: 'normalizedRoleId not found' });
    }
      const role = await Role.findByPk(normalizedRoleId);
      if (!role) {
      return res.status(404).json({ success: false, message: 'role not found' });
    }
      if (!canAssignRole(req.user?.role, role.code)) {
        return sendError(res, 'You cannot assign this role', 403);
      }
    }

    if (email && String(email).trim()) {
      const existingByEmail = await User.findOne({
        where: where(fn('lower', col('email')), String(email).trim().toLowerCase())
      });
      if (existingByEmail && Number(existingByEmail.id) !== Number(id)) {
        return sendError(res, 'Email already in use', 400);
      }
    }

    if (username && String(username).trim()) {
      const existingByUsername = await User.findOne({
        where: where(fn('lower', col('username')), String(username).trim().toLowerCase())
      });
      if (existingByUsername && Number(existingByUsername.id) !== Number(id)) {
        return sendError(res, 'Username already in use', 400);
      }
    }

    const updatePayload = {
      ...(first_name !== undefined ? { first_name: String(first_name).trim() } : {}),
      ...(last_name !== undefined ? { last_name: String(last_name).trim() } : {}),
      ...(email !== undefined ? { email: String(email).trim().toLowerCase() } : {}),
      ...(employee_id !== undefined ? { employee_id: String(employee_id).trim() } : {}),
      ...(username !== undefined ? { username: String(username).trim() } : {}),
      ...(hasRoleInPayload ? { role_id: normalizedRoleId } : {}),
      ...(entity_id !== undefined ? { entity_id: entity_id || null } : {}),
      ...(property_id !== undefined ? { property_id: property_id || null } : {}),
      ...(client_id !== undefined ? { client_id: client_id || null } : {}),
      ...(user_level !== undefined ? { user_level } : {}),
      ...(status !== undefined ? { status: String(status).toUpperCase() } : {})
    };

    if (password && String(password).trim()) {
      updatePayload.password_hash = await bcrypt.hash(String(password), 10);
    }

    await user.update(updatePayload);

    if (hasRoleInPayload && user.setRoles) {
      await user.setRoles([normalizedRoleId]);
    }
    {
      const access = require('../services/companyAccess.service');
      if (hasRoleInPayload) {
        const newRole = await Role.findByPk(normalizedRoleId, { attributes: ['code'] });
        await access.syncFromUsersScreen(user.id, user.client_id, newRole?.code);
      }
      access.invalidate(user.id); // status or role changes apply to open sessions right away
    }
    recordAdminAction(req, {
      action: previousStatus !== user.status ? 'USER_STATUS_CHANGED' : (previousRoleId !== user.role_id ? 'USER_ROLE_CHANGED' : 'USER_UPDATED'),
      module: 'USER',
      recordId: user.id,
      description: `Updated user ${user.username}`,
      oldValues: { status: previousStatus, role_id: previousRoleId },
      newValues: { status: user.status, role_id: user.role_id }
    });
    const safeUser = publicUser(user);
    return sendSuccess(res, safeUser, 'User updated successfully');
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return sendError(res, 'User not found', 404);

    // Multi-tenant Security
    const roleCode = String(req.user?.role || '').toUpperCase();
    const isGlobalAdmin = roleCode === 'PROVIDER_ADMIN' || isDevAdminRole(roleCode);
    if (!isGlobalAdmin && user.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot delete user from another tenant' });
    }
    
    // Prevent self-deletion
    if (Number(id) === Number(req.user?.id)) {
      return sendError(res, 'Self-deletion is not allowed', 400);
    }

    const targetCode = await roleCodeOf(user);
    if (PLATFORM_ROLES.includes(targetCode) && !isPlatformActor(roleCode)) {
      return sendError(res, 'You cannot deactivate a platform administrator account', 403);
    }

    // Soft delete — preserve FK references and audit trail
    await user.update({ status: 'INACTIVE' });
    require('../services/companyAccess.service').invalidate(user.id);
    recordAdminAction(req, {
      action: 'USER_DEACTIVATED',
      module: 'USER',
      recordId: user.id,
      description: `Deactivated user ${user.username}`,
      oldValues: { status: 'ACTIVE' },
      newValues: { status: 'INACTIVE' }
    });
    return sendSuccess(res, null, 'User deactivated successfully');
  } catch (error) {
    return sendError(res, error.message);
  }
};

// Admin-triggered password reset: generates a reset token and EMAILS the reset link to the
// user (the user sets their own new password — the admin never learns it). Tenant-scoped:
// PROVIDER_ADMIN/DEV_ADMIN can reset any user; other admins only within their own client.
// Every reset is written to the immutable audit trail.
exports.adminResetPassword = async (req, res) => {
  try {
    const requester = req.user || {};
    const role = String(requester.role || '').toUpperCase();
    const isProvider = role === 'PROVIDER_ADMIN' || isDevAdminRole(role);

    const target = await User.findByPk(req.params.id);
    if (!target) return sendError(res, 'User not found', 404);

    // Non-provider admins may only reset users inside their own tenant.
    if (!isProvider) {
      if (!requester.client_id || String(target.client_id || '') !== String(requester.client_id)) {
        return sendError(res, 'You can only reset passwords for users in your own organization', 403);
      }
    }
    if (!target.email) {
      return sendError(res, 'This user has no email on file — cannot send a reset link. Set an email first.', 400);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    target.reset_token = resetToken;
    target.reset_token_expiry = Date.now() + 60 * 60 * 1000; // 60 min for an admin-triggered reset
    await target.save();

    const base = (process.env.CLIENT_URL || process.env.PUBLIC_APP_URL || 'https://fixtag.in').replace(/\/$/, '');
    const resetUrl = `${base}/reset-password?token=${resetToken}`;
    let emailed = false;
    try {
      const emailSvc = require('../services/notificationEmail.service');
      const r = await emailSvc.sendEmail({
        to: target.email,
        subject: 'FixTag — Password Reset',
        html: `<p>Hello ${target.first_name || target.username || ''},</p>`
          + `<p>A password reset was initiated for your FixTag account by an administrator. `
          + `Use the link below to set a new password (valid for 60 minutes):</p>`
          + `<p><a href="${resetUrl}">Reset your password</a></p>`
          + `<p>If you did not expect this, please contact your administrator.</p>`
      });
      emailed = !!(r && r.success !== false);
    } catch (e) { /* fail-open — token is still set */ }

    // Immutable audit — who reset whom, when.
    try {
      const ImmutableAuditService = require('../services/ImmutableAuditService');
      ImmutableAuditService.log({
        clientId: target.client_id,
        userId: requester.id,
        action: 'ADMIN_PASSWORD_RESET',
        module: 'USER',
        entityType: 'USER',
        entityId: target.id,
        afterData: { reset_for: target.username, reset_by: requester.username, emailed },
        req
      });
    } catch (e) { /* audit non-blocking */ }

    return sendSuccess(res, { emailed },
      emailed ? `Password reset link sent to ${target.email}.`
              : `Reset link generated, but the email could not be sent (check email configuration). The link is valid for 60 minutes.`);
  } catch (error) {
    return sendError(res, error.message);
  }
};
