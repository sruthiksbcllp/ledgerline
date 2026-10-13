'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ImmutableAuditService = require('../services/ImmutableAuditService');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { User, Role, Entity, Permission, UserSession, RolePermission } = require('../models');
const { sendSuccess, sendError } = require('../utils/response');
const fs = require('fs');
const path = require('path');
const appLogger = require('../utils/appLogger');
const { isPrivilegedRole } = require('../utils/devRole');
const notificationEmail = require('../services/notificationEmail.service');
const mfaChallengeTracker = new Map();
const mfaAttemptTracker = new Map();
const MFA_RESEND_COOLDOWN_SECONDS = 30;
const MFA_MAX_ATTEMPTS = 5;
const MFA_LOCK_MINUTES = 5;
const MFA_ISSUER = process.env.MFA_ISSUER || 'SBC FIX-TAG';

const logFile = path.join(__dirname, '../server_debug.log');
const isDev = (process.env.NODE_ENV || 'development') === 'development';
const log = (msg) => {
  if (!isDev) return; // SECURITY: no debug log in staging/production
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
  } catch (err) {
    // swallow — logging must never crash the app
  }
};

const isMfaEnforced = () => String(process.env.MFA_ENFORCE_PRIVILEGED || 'false').toLowerCase() === 'true';
const getRequestIp = (req) => req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;

const persistRefreshSession = async (user, refreshTokenHash, req, context) => {
  user.refresh_token_hash = refreshTokenHash;
  await user.save();

  try {
    await UserSession.create({
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      ip_address: getRequestIp(req),
      user_agent: req.headers['user-agent']
    });
  } catch (error) {
    appLogger.warn({
      event: 'auth_session_persist_failed',
      user_id: user.id,
      client_id: user.client_id || null,
      context,
      error: error.message || String(error)
    });
  }
};

const generateTokens = (user, opts = {}) => {
  const mfaVerified = Boolean(opts.mfa_verified);
  const accessToken = jwt.sign(
    {
      id: user.id,
      role: user.role,
      client_id: user.client_id,
      mfa_verified: mfaVerified
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

const generateMfaSetupToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      purpose: 'mfa_setup'
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );
};

const verifyMfaSetupToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (!decoded || decoded.purpose !== 'mfa_setup' || !decoded.id) {
    throw new Error('Invalid MFA setup token');
  }
  return decoded;
};


exports.login = async (req, res) => {
  try {
    const identifier = req.body.username || req.body.email;
    const { password } = req.body || {};
    
    if (!identifier || !password) {
       return res.status(400).json({ success: false, message: 'Missing credentials (username/email and password required)' });
    }
    
    const user = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          require('sequelize').where(
            require('sequelize').fn('LOWER', require('sequelize').col('username')),
            identifier.toLowerCase()
          ),
          require('sequelize').where(
            require('sequelize').fn('LOWER', require('sequelize').col('email')),
            identifier.toLowerCase()
          )
        ],
        status: 'ACTIVE'
      },
      include: [
        {
          model: Role,
          as: 'Role',
          include: [{ model: RolePermission, as: 'RolePermissions' }]
        },
        {
          model: Role,
          as: 'Roles',
          through: { attributes: [] },
          include: [{ model: RolePermission, as: 'RolePermissions' }]
        },
        { model: Entity }
      ]
    });

    if (!user) {
      log(`Login Failed: User not found or inactive: ${identifier}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      log(`Login Failed: Password not set for user: ${identifier}`);
      return res.status(500).json({ 
        success: false, 
        message: 'User password not configured. Contact admin.' 
      });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(String(password), user.password_hash);

    if (!isMatch) {
      log(`Login Failed: Password mismatch for user: ${identifier}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // ── Subdomain tenant enforcement ──────────────────────────────────────────
    // req.subdomainClientId is set by subdomainTenantMiddleware when the
    // request arrives from a client subdomain (e.g. abc.fixtag.in).
    if (req.subdomainClientId) {
      const userRole = user.Role?.code || (user.Roles?.[0]?.code) || 'REQUESTER';
      if (userRole === 'PROVIDER_ADMIN' || userRole === 'SUPER_ADMIN') {
        // Provider-level admins must log in from the main domain, not a client subdomain
        return res.status(403).json({
          success: false,
          message: 'Please log in from the main portal.'
        });
      }
      if (user.client_id !== req.subdomainClientId) {
        // User belongs to a different tenant — deny access
        log(`Login Denied: User ${identifier} (client ${user.client_id}) attempted login on subdomain for client ${req.subdomainClientId}`);
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this portal.'
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Login Success
    user.role = user.Role ? user.Role.code : (user.Roles && user.Roles.length > 0 ? user.Roles[0].code : 'REQUESTER');
    const mfaEnabled = Boolean(user.mfa_enabled);
    const privileged = isPrivilegedRole(user.role);
    const requiresMfa = privileged && isMfaEnforced();

    // Hook for staged MFA rollout: if MFA is enforced for privileged roles,
    // allow bypass only when explicitly enabled for migration windows.
    // SECURITY: default is 'false' — MFA is never bypassed unless the env var
    // is explicitly set to 'true'. Deploying without this var keeps MFA ON.
    const bypass = String(process.env.MFA_BOOTSTRAP_BYPASS || 'false').toLowerCase() === 'true';
    const mfaVerified = !requiresMfa || bypass;

    const { accessToken, refreshToken } = generateTokens(user, { mfa_verified: mfaVerified });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await persistRefreshSession(user, refreshTokenHash, req, 'login');

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Activity Log
    try {
      const activityLogger = require('../services/activityLogger');
      activityLogger.log({
        user_id: user.id,
        action: 'LOGIN',
        module: 'AUTH',
        description: 'User logged into the system successfully',
        ip_address: getRequestIp(req)
      });
    } catch(e) {}

    // Flatten permissions for frontend
    const allPermissions = new Set();
    
    const processRole = (role) => {
      if (role?.RolePermissions) {
        role.RolePermissions.forEach(rp => {
          // Add standard actions if enabled
          const actions = [];
          if (rp.can_view) actions.push('VIEW');
          if (rp.can_add) actions.push('ADD');
          if (rp.can_edit) actions.push('EDIT');
          if (rp.can_delete) actions.push('DELETE');

          actions.forEach(action => {
            allPermissions.add(JSON.stringify({
              module: rp.section,
              section: rp.section,
              action: action
            }));
          });
        });
      }
    };

    // 1. Check direct role
    processRole(user.Role);
    
    // 2. Check many-to-many roles
    if (user.Roles) {
      user.Roles.forEach(role => processRole(role));
    }

    const finalPermissions = Array.from(allPermissions).map(p => JSON.parse(p));

    appLogger.info({
      event: 'auth_login_success',
      user_id: user.id,
      role: user.role,
      client_id: user.client_id || null,
      mfa_enforced: requiresMfa,
      mfa_verified: mfaVerified,
      ip: getRequestIp(req)
    });

    const mfaSetupRequired = requiresMfa && !mfaEnabled;
    const setupToken = mfaSetupRequired ? generateMfaSetupToken(user) : null;

    return res.json({
      token: accessToken,
      mfa_required: requiresMfa && !mfaVerified,
      mfa_setup_required: mfaSetupRequired,
      mfa_method: 'totp',
      setup_token: setupToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.Role ? user.Role.code : (user.Roles && user.Roles.length > 0 ? user.Roles[0].code : 'REQUESTER'),
        client_id: user.client_id
      }
    });

  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

exports.verifyMfa = async (req, res) => {
  try {
    const { username, otp } = req.body || {};
    if (!username || !otp) {
      return sendError(res, 'username and otp are required', 400);
    }

    const key = String(username).toLowerCase();
    const now = Date.now();
    const attemptState = mfaAttemptTracker.get(key) || { failures: 0, lockedUntil: 0 };
    if (attemptState.lockedUntil && attemptState.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((attemptState.lockedUntil - now) / 1000);
      return sendError(res, `Too many failed attempts. Retry in ${retryAfterSeconds}s`, 429);
    }

    const user = await User.findOne({
      where: { username, status: 'ACTIVE' },
      include: [{ model: Role, as: 'Role' }, { model: Role, as: 'Roles', through: { attributes: [] } }]
    });
    if (!user) return sendError(res, 'User not found', 404);

    const secret = user.mfa_secret;
    if (!secret || !user.mfa_enabled) {
      return sendError(res, 'MFA is not enrolled for this account', 400);
    }

    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: String(otp),
      window: 1
    });

    if (!isValid) {
      const failures = Number(attemptState.failures || 0) + 1;
      const shouldLock = failures >= MFA_MAX_ATTEMPTS;
      const lockedUntil = shouldLock ? now + (MFA_LOCK_MINUTES * 60 * 1000) : 0;
      mfaAttemptTracker.set(key, { failures: shouldLock ? 0 : failures, lockedUntil });

      if (shouldLock) {
        return sendError(res, `Too many failed attempts. Locked for ${MFA_LOCK_MINUTES} minutes`, 429);
      }
      return sendError(res, 'Invalid OTP', 401);
    }

    // successful verification clears failure counter
    mfaAttemptTracker.delete(key);

    user.role = user.Role ? user.Role.code : (user.Roles && user.Roles.length > 0 ? user.Roles[0].code : 'REQUESTER');
    const { accessToken, refreshToken } = generateTokens(user, { mfa_verified: true });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    user.mfa_last_verified_at = new Date();
    await persistRefreshSession(user, refreshTokenHash, req, 'verifyMfa');

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    ImmutableAuditService.log({
      clientId: user.client_id,
      userId: user.id,
      action: 'LOGIN',
      module: 'AUTH',
      entityType: 'USER',
      entityId: user.id,
      afterData: { username: user.username, role: user.role },
      req
    });
    return sendSuccess(res, {
      token: accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        client_id: user.client_id
      }
    }, 'MFA verified');
  } catch (error) {
    return sendError(res, error.message || 'MFA verification failed', 500);
  }
};

exports.mfaChallenge = async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) {
      return sendError(res, 'username is required', 400);
    }

    const user = await User.findOne({ where: { username, status: 'ACTIVE' } });
    if (!user) return sendError(res, 'User not found', 404);

    const key = String(username).toLowerCase();
    const now = Date.now();
    const previous = mfaChallengeTracker.get(key);
    if (previous && previous > now) {
      const retryAfterSeconds = Math.ceil((previous - now) / 1000);
      return sendError(res, `Please wait ${retryAfterSeconds}s before requesting another OTP`, 429);
    }

    const nextAllowedAt = now + MFA_RESEND_COOLDOWN_SECONDS * 1000;
    mfaChallengeTracker.set(key, nextAllowedAt);

    appLogger.info({
      event: 'auth_mfa_challenge_requested',
      user_id: user.id,
      username: user.username
    });

    return sendSuccess(res, { username: user.username, resend_cooldown_seconds: MFA_RESEND_COOLDOWN_SECONDS }, 'TOTP challenge active');
  } catch (error) {
    return sendError(res, error.message || 'MFA challenge failed', 500);
  }
};

exports.startMfaEnrollment = async (req, res) => {
  try {
    const { setup_token } = req.body || {};
    if (!setup_token) return sendError(res, 'setup_token is required', 400);

    const decoded = verifyMfaSetupToken(setup_token);
    const user = await User.findOne({ where: { id: decoded.id, status: 'ACTIVE' } });
    if (!user) return sendError(res, 'User not found', 404);

    const secret = speakeasy.generateSecret({
      name: `${MFA_ISSUER}:${user.username}`,
      issuer: MFA_ISSUER,
      length: 20
    });

    user.mfa_secret = secret.base32;
    await user.save();

    const qr_code_data_url = await QRCode.toDataURL(secret.otpauth_url);

    return sendSuccess(
      res,
      {
        setup_token,
        qr_code_data_url,
        manual_entry_key: secret.base32,
        account_name: user.username,
        issuer: MFA_ISSUER
      },
      'MFA enrollment started'
    );
  } catch (error) {
    return sendError(res, error.message || 'Failed to start MFA enrollment', 400);
  }
};

exports.completeMfaEnrollment = async (req, res) => {
  try {
    const { setup_token, otp } = req.body || {};
    if (!setup_token || !otp) return sendError(res, 'setup_token and otp are required', 400);

    const decoded = verifyMfaSetupToken(setup_token);
    const user = await User.findOne({
      where: { id: decoded.id, status: 'ACTIVE' },
      include: [{ model: Role, as: 'Role' }, { model: Role, as: 'Roles', through: { attributes: [] } }]
    });
    if (!user) return sendError(res, 'User not found', 404);
    if (!user.mfa_secret) return sendError(res, 'MFA secret not initialized', 400);

    const isValid = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token: String(otp),
      window: 1
    });
    if (!isValid) return sendError(res, 'Invalid OTP', 401);

    user.mfa_enabled = true;
    user.mfa_last_verified_at = new Date();
    await user.save();

    user.role = user.Role ? user.Role.code : (user.Roles && user.Roles.length > 0 ? user.Roles[0].code : 'REQUESTER');
    const { accessToken, refreshToken } = generateTokens(user, { mfa_verified: true });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await persistRefreshSession(user, refreshTokenHash, req, 'completeMfaEnrollment');

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return sendSuccess(res, {
      token: accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        client_id: user.client_id
      }
    }, 'MFA enrollment completed');
  } catch (error) {
    return sendError(res, error.message || 'Failed to complete MFA enrollment', 400);
  }
};

exports.resetUserMfaByProviderAdmin = async (req, res) => {
  try {
    const { user_id, username, reason, audit_note } = req.body || {};
    if (!user_id && !username) {
      return sendError(res, 'user_id or username is required', 400);
    }
    if (!reason) {
      return sendError(res, 'reason is required', 400);
    }
    if (!audit_note || String(audit_note).trim().length < 10) {
      return sendError(res, 'audit_note is required (minimum 10 characters)', 400);
    }

    const where = user_id ? { id: user_id } : { username };
    const user = await User.findOne({ where });
    if (!user) return sendError(res, 'Target user not found', 404);

    // Never allow accidental reset of the acting provider admin account.
    if (Number(user.id) === Number(req.user?.id)) {
      return sendError(res, 'You cannot reset MFA for your own account from this endpoint', 400);
    }

    user.mfa_enabled = false;
    user.mfa_secret = null;
    user.mfa_last_verified_at = null;
    user.refresh_token_hash = null;
    await user.save();

    await UserSession.update(
      { is_revoked: true },
      { where: { user_id: user.id, is_revoked: false } }
    );

    appLogger.warn({
      event: 'auth_mfa_reset_by_provider_admin',
      actor_user_id: req.user?.id || null,
      target_user_id: user.id,
      target_username: user.username,
      reason,
      audit_note: String(audit_note).trim()
    });

    try {
      const activityLogger = require('../services/activityLogger');
      activityLogger.log({
        user_id: req.user?.id,
        action: 'MFA_RESET',
        module: 'AUTH',
        record_id: user.id,
        description: `Provider admin reset MFA for ${user.username}`,
        metadata: {
          target_user_id: user.id,
          target_username: user.username,
          reason,
          audit_note: String(audit_note).trim()
        },
        ip_address: getRequestIp(req),
        client_id: req.user?.client_id || null,
        actor_role: req.user?.role || null,
        request_method: req.method,
        request_path: req.originalUrl,
        user_agent: req.headers['user-agent'] || null
      });
    } catch (logErr) {
      appLogger.warn({
        event: 'auth_mfa_reset_activity_log_failed',
        actor_user_id: req.user?.id || null,
        target_user_id: user.id,
        error: logErr.message || String(logErr)
      });
    }

    return sendSuccess(res, {
      user_id: user.id,
      username: user.username,
      mfa_enabled: false
    }, 'User MFA reset successfully');
  } catch (error) {
    return sendError(res, error.message || 'Failed to reset user MFA', 500);
  }
};

exports.logout = async (req, res) => {
  try {
    const { id } = req.user || {};
    if (id) {
      const user = await User.findByPk(id);
      if (user) {
        user.refresh_token_hash = null;
        await user.save();
      }
      // Revoke sessions
      await UserSession.update({ is_revoked: true }, { where: { user_id: id } });
    }
    res.clearCookie('refreshToken');
    ImmutableAuditService.log({
      clientId: req.user?.client_id,
      userId: req.user?.id,
      action: 'LOGOUT',
      module: 'AUTH',
      entityType: 'USER',
      entityId: req.user?.id,
      req
    });
    return sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    return sendSuccess(res, null, 'Logged out successfully'); // Always succeed
  }
};

exports.refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.json({ success: true, data: {} });

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    
    const user = await User.findOne({
      where: { id: decoded.id, status: 'ACTIVE' },
      include: [
        { model: Role, as: 'Role' },
        { model: Role, as: 'Roles', through: { attributes: [] } },
        { model: Entity }
      ]
    });

    if (!user) {
       return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    if (!user.refresh_token_hash) {
       return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const isMatch = await bcrypt.compare(token, user.refresh_token_hash);
    if (!isMatch) {
       return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    user.role = user.Role ? user.Role.code : (user.Roles && user.Roles.length > 0 ? user.Roles[0].code : 'REQUESTER');
    const tokens = generateTokens(user);

    const newRefreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await persistRefreshSession(user, newRefreshHash, req, 'refreshToken');

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return sendSuccess(res, { accessToken: tokens.accessToken });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Session expired' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return sendError(res, 'Email is required', 400);

    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      // Don't reveal if email exists for security, but we'll return success
      return sendSuccess(res, null, 'If this email is registered, a reset link will be sent.');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.reset_token = resetToken;
    user.reset_token_expiry = Date.now() + 15 * 60 * 1000; // 15 mins
    await user.save();

    // FIX: actually email the reset link. Fail-open — if email transport is unconfigured we still
    // return the generic response (and never reveal transport errors, to avoid user enumeration).
    const _base = (process.env.CLIENT_URL || process.env.PUBLIC_APP_URL || 'https://fixtag.in').replace(/\/$/, '');
    const _resetUrl = `${_base}/reset-password?token=${resetToken}`;
    try {
      await notificationEmail.sendEmail({
        to: user.email,
        subject: 'FixTag — Password Reset',
        html: `<p>Hello ${user.first_name || user.username || ''},</p>`
          + `<p>A password reset was requested for your FixTag account. This link is valid for 15 minutes:</p>`
          + `<p><a href="${_resetUrl}">Reset your password</a></p>`
          + `<p>If you did not request this, you can safely ignore this email.</p>`
      });
    } catch (e) { /* fail-open */ }

    return sendSuccess(res, null, 'If this email is registered, a reset link will be sent.');
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return sendError(res, 'Token and new password are required', 400);

    const user = await User.findOne({
      where: {
        reset_token: token,
        reset_token_expiry: { [require('sequelize').Op.gt]: Date.now() }
      }
    });

    if (!user) return sendError(res, 'Invalid or expired reset token', 400);

    user.password_hash = await bcrypt.hash(String(newPassword), 10);
    user.reset_token = null;
    user.reset_token_expiry = null;
    await user.save();

    log(`Password reset successful for: ${user.username}`);
    return sendSuccess(res, 'Password reset successful');
  } catch (err) {
    return sendError(res, err.message || 'Reset failed', 500);
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 'Unauthorized', 401);

    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return sendError(res, 'current_password and new_password are required', 400);
    }
    if (String(new_password).length < 8) {
      return sendError(res, 'New password must be at least 8 characters', 400);
    }

    const user = await User.findByPk(userId);
    if (!user) return sendError(res, 'User not found', 404);

    const isMatch = await bcrypt.compare(String(current_password), user.password_hash);
    if (!isMatch) return sendError(res, 'Current password is incorrect', 401);

    user.password_hash = await bcrypt.hash(String(new_password), 10);
    await user.save();

    return sendSuccess(res, 'Password changed successfully');
  } catch (err) {
    return sendError(res, err.message || 'Change password failed', 500);
  }
};

/**
 * GET /api/auth/my-companies
 * List all companies user has access to
 */
exports.getMyCompanies = async (req, res) => {
  try {
    const userId = req.user?.id;
    const clientId = req.user?.client_id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { UserCompanyAssignment, Company } = require('../models');

    const where = { user_id: userId };
    if (clientId) where.client_id = clientId;

    const assignments = await UserCompanyAssignment.findAll({
      where,
      include: [
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'company_code', 'company_name', 'is_primary']
        }
      ],
      order: [['is_primary', 'DESC'], ['created_at', 'ASC']]
    });

    const companies = assignments.map(a => ({
      id: a.company.id,
      company_code: a.company.company_code,
      company_name: a.company.company_name,
      is_primary: a.is_primary,
      access_level: a.access_level
    }));

    return res.json(companies);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get companies' });
  }
};

/**
 * GET /api/auth/current-company
 * Get current active company for user
 */
exports.getCurrentCompany = async (req, res) => {
  try {
    const userId = req.user?.id;
    const clientId = req.user?.client_id;
    const companyId = req.headers['x-company-id'];

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { UserCompanyAssignment, Company } = require('../models');

    let assignment;
    const baseWhere = { user_id: userId };
    if (clientId) baseWhere.client_id = clientId;

    if (companyId) {
      // Get specific company
      assignment = await UserCompanyAssignment.findOne({
        where: { ...baseWhere, company_id: parseInt(companyId, 10) },
        include: [{ model: Company, as: 'company' }]
      });
    } else {
      // Get primary company
      assignment = await UserCompanyAssignment.findOne({
        where: { ...baseWhere, is_primary: true },
        include: [{ model: Company, as: 'company' }]
      });
    }

    if (!assignment) {
      return res.status(404).json({ error: 'Company not found' });
    }

    return res.json({
      id: assignment.company.id,
      company_code: assignment.company.company_code,
      company_name: assignment.company.company_name,
      is_primary: assignment.is_primary,
      access_level: assignment.access_level
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get current company' });
  }
};

/**
 * POST /api/auth/switch-company/:companyId
 * Switch user's active company
 */
exports.switchCompany = async (req, res) => {
  try {
    const userId = req.user?.id;
    const clientId = req.user?.client_id;
    const companyId = parseInt(req.params.companyId, 10);

    if (!userId || isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const { UserCompanyAssignment, Company } = require('../models');

    // Verify user has access to this company
    const switchWhere = { user_id: userId, company_id: companyId };
    if (clientId) switchWhere.client_id = clientId;

    const assignment = await UserCompanyAssignment.findOne({
      where: switchWhere,
      include: [{ model: Company, as: 'company' }]
    });

    if (!assignment) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    // Return current company info with x-company-id header set for client
    return res.json({
      id: assignment.company.id,
      company_code: assignment.company.company_code,
      company_name: assignment.company.company_name,
      is_primary: assignment.is_primary,
      access_level: assignment.access_level,
      message: `Switched to ${assignment.company.company_name}`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to switch company' });
  }
};
