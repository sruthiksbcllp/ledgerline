'use strict';

/**
 * Multi-company access.
 *
 * A user can belong to several companies (clients) through CompanyMembership rows, each with its
 * own role. After login they pick a company and their session (JWT) is bound to it:
 *   { id, client_id, role, cid }       cid = the company the membership is for
 *   { id, client_id, role:'ADMIN', pa } a Super Admin who entered one company (pa = platform admin)
 *   { id, client_id, role }            a Super Admin in the platform view, or a user with no company
 * Every request re-checks (cached for a few seconds) that the membership is still ACTIVE with the
 * same role, so removing someone or changing their role takes effect immediately, not at token expiry.
 *
 * People whose account email is on a company's registered domain can ask to join it; a Company
 * Admin approves (choosing the role) or rejects.
 */
const { Op } = require('sequelize');
const { CompanyMembership, Client, User, Role } = require('../models');
const { findRole, canAssignRole, tierOf, TIERS, DEFAULT_MEMBER_ROLE } = require('../config/rbac');
const { isDevAdminRole } = require('../utils/devRole');
const { emailDomain, isPublicEmailDomain } = require('../utils/companyDomain');

class AccessError extends Error {
  constructor(message, status = 400, code = 'ACCESS_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const upper = (v) => String(v || '').toUpperCase();
const isPlatformRole = (role) => upper(role) === 'PROVIDER_ADMIN' || isDevAdminRole(role);
const isCompanyAdminRole = (role) => ['ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN'].includes(upper(role));

/** The role stored on the account (platform roles live here; company roles live on memberships). */
const accountRoleOf = (user) => upper(user?.Role?.code || user?.Roles?.[0]?.code || 'REQUESTER');

const tierInfo = (role) => {
  const code = tierOf(role);
  const t = TIERS.find((x) => x.code === code);
  return { tier: code, tier_name: t ? t.name : code };
};
const roleName = (code) => findRole(code)?.name || (upper(code) === 'PROVIDER_ADMIN' ? 'Super Admin' : code);

// ── Session context ─────────────────────────────────────────────────────────────────────────────

/**
 * Users created by older code paths may have a company but no membership row yet. Give them one
 * (ACTIVE, with their account role) the first time they sign in, so nobody is locked out. Only when
 * they have no row at all for that company: a PENDING / REJECTED / REVOKED row is respected.
 */
async function healHomeMembership(user, accountRole) {
  if (!user.client_id || isPlatformRole(accountRole)) return;
  const existing = await CompanyMembership.findOne({ where: { user_id: user.id, client_id: user.client_id } });
  if (existing) return;
  await CompanyMembership.create({ user_id: user.id, client_id: user.client_id, role_code: accountRole, status: 'ACTIVE' });
}

/**
 * Which company and role a new session should carry.
 * preferred: a client id to enter, or null for the default (last used, else home company).
 * Returns { client_id, role, cid, pa, company }.
 */
async function resolveContext(user, accountRole, preferred = null) {
  if (isPlatformRole(accountRole)) {
    const pref = Number(preferred);
    if (Number.isInteger(pref) && pref > 0) {
      const company = await Client.findByPk(pref, { attributes: ['id', 'client_name'] });
      if (!company) throw new AccessError('That company no longer exists.', 404, 'NO_COMPANY');
      // Inside one company a Super Admin acts as its Company Admin, so every existing tenant
      // filter applies; the platform view (below) is where cross-company work happens.
      return { client_id: company.id, role: 'ADMIN', cid: company.id, pa: true, company };
    }
    return { client_id: user.client_id || null, role: accountRole, cid: null, pa: false, company: null };
  }

  await healHomeMembership(user, accountRole);
  const memberships = await CompanyMembership.findAll({
    where: { user_id: user.id, status: 'ACTIVE' },
    include: [{ model: Client, as: 'Client', attributes: ['id', 'client_name'] }]
  });
  const usable = memberships.filter((m) => m.Client);
  let chosen = null;
  if (preferred != null) {
    chosen = usable.find((m) => Number(m.client_id) === Number(preferred)) || null;
    if (!chosen) throw new AccessError('You do not have access to that company.', 403, 'NOT_A_MEMBER');
  } else if (usable.length) {
    const byRecent = usable.slice().sort((a, b) => (new Date(b.last_used_at || 0)) - (new Date(a.last_used_at || 0)));
    chosen = byRecent[0].last_used_at ? byRecent[0] : (usable.find((m) => m.client_id === user.client_id) || usable[0]);
  }
  if (!chosen) return { client_id: null, role: accountRole, cid: null, pa: false, company: null };
  return { client_id: chosen.client_id, role: upper(chosen.role_code), cid: chosen.client_id, pa: false, company: chosen.Client };
}

async function markUsed(userId, clientId) {
  if (!clientId) return;
  await CompanyMembership.update({ last_used_at: new Date() }, { where: { user_id: userId, client_id: clientId } }).catch(() => {});
}

// ── Per-request check (cached) ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 1000;
const cache = new Map(); // key -> { ok, at }

/** Clears cached checks for a user (call after changing their membership or account). */
function invalidate(userId) {
  for (const key of cache.keys()) if (key.startsWith(`${userId}:`)) cache.delete(key);
}

/**
 * Is this session still allowed? Tokens issued before multi-company access (no cid / pa claim)
 * are accepted as before; they expire within a day.
 */
async function sessionStillValid(claims) {
  if (!claims || (!claims.cid && !claims.pa)) return true;
  const key = `${claims.id}:${claims.pa ? 'pa' : claims.cid}:${upper(claims.role)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ok;
  let ok = false;
  if (claims.pa) {
    const user = await User.findByPk(claims.id, { attributes: ['id', 'status'], include: [{ model: Role, as: 'Role', attributes: ['code'] }] });
    ok = Boolean(user && user.status === 'ACTIVE' && isPlatformRole(user.Role?.code));
  } else {
    const m = await CompanyMembership.findOne({
      where: { user_id: claims.id, client_id: claims.cid },
      include: [{ model: User, as: 'User', attributes: ['id', 'status'] }]
    });
    ok = Boolean(m && m.status === 'ACTIVE' && upper(m.role_code) === upper(claims.role) && m.User?.status === 'ACTIVE');
  }
  cache.set(key, { ok, at: Date.now() });
  return ok;
}

// ── Company picker ──────────────────────────────────────────────────────────────────────────────

/** What the company picker shows for this user. */
async function listWorkspaces(user, accountRole, currentClientId = null) {
  const domain = emailDomain(user.email);
  if (isPlatformRole(accountRole)) {
    const clients = await Client.findAll({ attributes: ['id', 'client_name', 'email_domain'], order: [['client_name', 'ASC']] });
    const counts = await CompanyMembership.findAll({
      attributes: ['client_id', [CompanyMembership.sequelize.fn('COUNT', CompanyMembership.sequelize.col('id')), 'n']],
      where: { status: 'ACTIVE' },
      group: ['client_id'],
      raw: true
    });
    const memberCount = new Map(counts.map((c) => [Number(c.client_id), Number(c.n)]));
    return {
      is_super_admin: true,
      current_client_id: currentClientId,
      companies: clients.map((c) => ({
        client_id: c.id,
        name: c.client_name,
        email_domain: c.email_domain,
        members: memberCount.get(c.id) || 0,
        role: 'ADMIN',
        role_name: 'Super Admin',
        ...tierInfo('PROVIDER_ADMIN')
      })),
      pending: [],
      joinable: []
    };
  }

  await healHomeMembership(user, accountRole);
  const rows = await CompanyMembership.findAll({
    where: { user_id: user.id },
    include: [{ model: Client, as: 'Client', attributes: ['id', 'client_name', 'email_domain'] }],
    order: [['last_used_at', 'DESC'], ['createdAt', 'ASC']]
  });
  const live = rows.filter((m) => m.Client);
  const companies = live.filter((m) => m.status === 'ACTIVE').map((m) => ({
    client_id: m.client_id,
    name: m.Client.client_name,
    email_domain: m.Client.email_domain,
    role: upper(m.role_code),
    role_name: roleName(m.role_code),
    last_used_at: m.last_used_at,
    ...tierInfo(m.role_code)
  }));
  const pending = live.filter((m) => m.status === 'PENDING').map((m) => ({
    client_id: m.client_id, name: m.Client.client_name, requested_at: m.updatedAt, requested_role: m.requested_role
  }));

  // Companies registered to the same (non-public) email domain that this user isn't in yet.
  let joinable = [];
  if (domain && !isPublicEmailDomain(domain)) {
    const blocked = new Set(live.filter((m) => ['ACTIVE', 'PENDING'].includes(m.status)).map((m) => Number(m.client_id)));
    const rejected = new Set(live.filter((m) => m.status === 'REJECTED').map((m) => Number(m.client_id)));
    const sameDomain = await Client.findAll({ where: { email_domain: domain }, attributes: ['id', 'client_name', 'email_domain'] });
    joinable = sameDomain.filter((c) => !blocked.has(Number(c.id))).map((c) => ({
      client_id: c.id, name: c.client_name, email_domain: c.email_domain, previously_rejected: rejected.has(Number(c.id))
    }));
  }
  return { is_super_admin: false, current_client_id: currentClientId, companies, pending, joinable };
}

/** Roles someone may suggest when asking to join (never admin; the Company Admin decides). */
const requestableRoles = () => require('../config/rbac').ROLES
  .filter((r) => r.code !== 'ADMIN' && r.code !== 'VENDOR')
  .map((r) => ({ code: r.code, name: r.name, ...tierInfo(r.code) }));

/** Ask to join a company whose registered email domain matches the user's account email. */
async function requestAccess(user, clientId, { note, requestedRole } = {}) {
  const client = await Client.findByPk(clientId, { attributes: ['id', 'client_name', 'email_domain'] });
  if (!client) throw new AccessError('Company not found.', 404, 'NO_COMPANY');
  const domain = emailDomain(user.email);
  if (!domain || isPublicEmailDomain(domain) || !client.email_domain || client.email_domain.toLowerCase() !== domain) {
    throw new AccessError('You can only request access to a company registered to your work email domain.', 403, 'DOMAIN_MISMATCH');
  }
  const wanted = requestedRole ? findRole(requestedRole) : findRole(DEFAULT_MEMBER_ROLE);
  if (!wanted || wanted.code === 'ADMIN' || wanted.code === 'VENDOR') throw new AccessError('Choose a valid role to request.', 400, 'BAD_ROLE');
  const cleanNote = String(note || '').trim().slice(0, 500) || null;

  const existing = await CompanyMembership.findOne({ where: { user_id: user.id, client_id: client.id } });
  if (existing?.status === 'ACTIVE') throw new AccessError('You already have access to this company.', 409, 'ALREADY_MEMBER');
  if (existing?.status === 'PENDING') throw new AccessError('Your request is already waiting for approval.', 409, 'ALREADY_PENDING');
  const values = {
    status: 'PENDING', role_code: wanted.code, requested_role: wanted.code, request_note: cleanNote,
    decided_by: null, decided_at: null, decision_note: null
  };
  const row = existing
    ? await existing.update(values)
    : await CompanyMembership.create({ user_id: user.id, client_id: client.id, ...values });
  invalidate(user.id);
  return { membership: row, company: client };
}

/** Withdraw one's own pending request. */
async function cancelRequest(user, clientId) {
  const row = await CompanyMembership.findOne({ where: { user_id: user.id, client_id: clientId, status: 'PENDING' } });
  if (!row) throw new AccessError('No pending request for that company.', 404, 'NO_REQUEST');
  await row.destroy();
}

// ── Company Admin: requests and members ─────────────────────────────────────────────────────────

const memberView = (m) => ({
  id: m.id,
  user_id: m.user_id,
  name: [m.User?.first_name, m.User?.last_name].filter(Boolean).join(' ') || m.User?.username,
  username: m.User?.username,
  email: m.User?.email,
  account_status: m.User?.status,
  status: m.status,
  role: upper(m.role_code),
  role_name: roleName(m.role_code),
  ...tierInfo(m.role_code),
  requested_role: m.requested_role,
  requested_role_name: m.requested_role ? roleName(m.requested_role) : null,
  request_note: m.request_note,
  decided_at: m.decided_at,
  decided_by_name: m.DecidedBy ? [m.DecidedBy.first_name, m.DecidedBy.last_name].filter(Boolean).join(' ') || m.DecidedBy.username : null,
  decision_note: m.decision_note,
  last_used_at: m.last_used_at,
  created_at: m.createdAt,
  updated_at: m.updatedAt
});

const USER_ATTRS = ['id', 'first_name', 'last_name', 'username', 'email', 'status'];

async function listMemberships(clientId, statuses) {
  const rows = await CompanyMembership.findAll({
    where: { client_id: clientId, status: { [Op.in]: statuses } },
    include: [
      { model: User, as: 'User', attributes: USER_ATTRS },
      { model: User, as: 'DecidedBy', attributes: ['id', 'first_name', 'last_name', 'username'] }
    ],
    order: [['updatedAt', 'DESC']]
  });
  return rows.filter((m) => m.User).map(memberView);
}

async function loadMembership(clientId, membershipId) {
  const m = await CompanyMembership.findOne({
    where: { id: membershipId, client_id: clientId },
    include: [{ model: User, as: 'User', attributes: [...USER_ATTRS, 'client_id', 'role_id'] }]
  });
  if (!m || !m.User) throw new AccessError('Member not found in this company.', 404, 'NOT_FOUND');
  return m;
}

async function activeAdminCount(clientId, excludingId) {
  const rows = await CompanyMembership.findAll({ where: { client_id: clientId, status: 'ACTIVE' }, attributes: ['id', 'role_code'] });
  return rows.filter((r) => r.id !== excludingId && isCompanyAdminRole(r.role_code)).length;
}

function assertAssignable(actorRole, roleCode) {
  const role = findRole(roleCode);
  if (!role) throw new AccessError('Choose a valid role.', 400, 'BAD_ROLE');
  if (!canAssignRole(actorRole, role.code)) throw new AccessError('You cannot assign that role.', 403, 'ROLE_NOT_ALLOWED');
  return role;
}

/**
 * Keep the account's own role_id in step with the role in the user's home company, so older screens
 * that read the account role (user list, profile) show the same thing.
 */
async function syncHomeRole(membership, roleCode) {
  const user = membership.User;
  if (!user || Number(user.client_id) !== Number(membership.client_id)) return;
  const role = await Role.findOne({ where: { code: roleCode }, attributes: ['id'] });
  if (!role) return;
  await User.update({ role_id: role.id }, { where: { id: user.id } });
  const full = await User.findByPk(user.id);
  if (full?.setRoles) await full.setRoles([role.id]);
}

async function decideRequest(actor, clientId, membershipId, { approve, role, note }) {
  const m = await loadMembership(clientId, membershipId);
  if (m.status !== 'PENDING') throw new AccessError('This request has already been handled.', 409, 'NOT_PENDING');
  if (Number(m.user_id) === Number(actor.id)) throw new AccessError('You cannot decide your own request.', 403, 'SELF');
  const values = { decided_by: actor.id, decided_at: new Date(), decision_note: String(note || '').trim().slice(0, 500) || null };
  if (approve) {
    const granted = assertAssignable(actor.role, role || m.requested_role || DEFAULT_MEMBER_ROLE);
    await m.update({ ...values, status: 'ACTIVE', role_code: granted.code });
    if (!m.User.client_id) await User.update({ client_id: clientId }, { where: { id: m.user_id } });
    await syncHomeRole(m, granted.code);
  } else {
    await m.update({ ...values, status: 'REJECTED' });
  }
  invalidate(m.user_id);
  return memberView(await CompanyMembership.findByPk(m.id, { include: [{ model: User, as: 'User', attributes: USER_ATTRS }, { model: User, as: 'DecidedBy', attributes: ['id', 'first_name', 'last_name', 'username'] }] }));
}

async function changeMemberRole(actor, clientId, membershipId, roleCode) {
  const m = await loadMembership(clientId, membershipId);
  if (m.status !== 'ACTIVE') throw new AccessError('Only active members can have their role changed.', 409, 'NOT_ACTIVE');
  if (Number(m.user_id) === Number(actor.id)) throw new AccessError('You cannot change your own role. Ask another Company Admin.', 403, 'SELF');
  const role = assertAssignable(actor.role, roleCode);
  if (isCompanyAdminRole(m.role_code) && !isCompanyAdminRole(role.code) && (await activeAdminCount(clientId, m.id)) === 0) {
    throw new AccessError('This is the last Company Admin. Make someone else an admin first.', 409, 'LAST_ADMIN');
  }
  const from = upper(m.role_code);
  await m.update({ role_code: role.code, decided_by: actor.id, decided_at: new Date() });
  await syncHomeRole(m, role.code);
  invalidate(m.user_id);
  return { from, to: role.code };
}

async function revokeMember(actor, clientId, membershipId) {
  const m = await loadMembership(clientId, membershipId);
  if (m.status !== 'ACTIVE') throw new AccessError('This person is not an active member.', 409, 'NOT_ACTIVE');
  if (Number(m.user_id) === Number(actor.id)) throw new AccessError('You cannot remove yourself.', 403, 'SELF');
  if (isCompanyAdminRole(m.role_code) && (await activeAdminCount(clientId, m.id)) === 0) {
    throw new AccessError('This is the last Company Admin. Make someone else an admin first.', 409, 'LAST_ADMIN');
  }
  await m.update({ status: 'REVOKED', decided_by: actor.id, decided_at: new Date() });
  invalidate(m.user_id);
}

/** Record membership for users created by a Company Admin (Users screen) or at sign-up. */
async function upsertMembership(userId, clientId, roleCode, status = 'ACTIVE', extra = {}, transaction) {
  const existing = await CompanyMembership.findOne({ where: { user_id: userId, client_id: clientId }, transaction });
  if (existing) await existing.update({ role_code: roleCode, status, ...extra }, { transaction });
  else await CompanyMembership.create({ user_id: userId, client_id: clientId, role_code: roleCode, status, ...extra }, { transaction });
  invalidate(userId);
}

/**
 * The Users screen edits the account's role in its home company: mirror it on the membership.
 * Never re-activates a removed or pending member; creates the membership only if there is none.
 */
async function syncFromUsersScreen(userId, clientId, roleCode) {
  if (!clientId || !roleCode || isPlatformRole(roleCode)) return;
  const existing = await CompanyMembership.findOne({ where: { user_id: userId, client_id: clientId } });
  if (!existing) await CompanyMembership.create({ user_id: userId, client_id: clientId, role_code: upper(roleCode), status: 'ACTIVE' });
  else if (existing.status === 'ACTIVE') await existing.update({ role_code: upper(roleCode) });
  invalidate(userId);
}

module.exports = {
  AccessError,
  syncFromUsersScreen,
  isPlatformRole,
  isCompanyAdminRole,
  accountRoleOf,
  tierInfo,
  resolveContext,
  markUsed,
  sessionStillValid,
  invalidate,
  listWorkspaces,
  requestableRoles,
  requestAccess,
  cancelRequest,
  listMemberships,
  decideRequest,
  changeMemberRole,
  revokeMember,
  upsertMembership
};
