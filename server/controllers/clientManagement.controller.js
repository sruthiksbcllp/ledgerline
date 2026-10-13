'use strict';
const { Client, ClientLicense, SupportTicket, Asset, User, ImmutableAuditLog, sequelize } = require('../models');
const { sendSuccess, sendError } = require('../utils/response');
const { QueryTypes } = require('sequelize');
const emailService = require('../services/notificationEmail.service');
const crypto = require('crypto');
const { provisionClientDepreciation } = require('../services/depreciationProvisioning.service');

const normalizeClientId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const normalizeLimit = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' && value.toUpperCase() === 'UNLIMITED') return -1;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n === -1) return -1;
  return Math.max(0, Math.floor(n));
};

const getTenantPurgeImpact = async (clientId, transaction) => {
  const tableRows = await sequelize.query('SHOW TABLES', { type: QueryTypes.SELECT, transaction });
  const tableNames = tableRows
    .map((row) => Object.values(row)[0])
    .filter((name) => typeof name === 'string');

  const protectedTables = new Set(['sequelize_meta']);
  const skipTables = new Set(['clients', 'client_licenses', 'support_tickets']);
  const immutableLogTables = new Set(['activitylogs']);
  const impact = [];

  for (const tableName of tableNames) {
    const lower = tableName.toLowerCase();
    if (protectedTables.has(lower) || skipTables.has(lower) || immutableLogTables.has(lower)) continue;

    const columns = await sequelize.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE 'client_id'`, {
      type: QueryTypes.SELECT,
      transaction
    });
    if (!columns.length) continue;

    const countRows = await sequelize.query(
      `SELECT COUNT(*) AS cnt FROM \`${tableName}\` WHERE client_id = :clientId`,
      { replacements: { clientId }, type: QueryTypes.SELECT, transaction }
    );
    const count = Number(countRows?.[0]?.cnt || 0);
    if (count > 0) {
      impact.push({ table: tableName, rows: count });
    }
  }

  const supportCount = await SupportTicket.count({ where: { client_id: clientId }, transaction });
  if (supportCount > 0) impact.push({ table: 'support_tickets', rows: supportCount });

  const licenseCount = await ClientLicense.count({ where: { client_id: clientId }, transaction });
  if (licenseCount > 0) impact.push({ table: 'client_licenses', rows: licenseCount });

  return {
    impact,
    retained_tables: Array.from(immutableLogTables)
  };
};

/**
 * Build a production-grade, schema-driven tenant deletion plan directly from
 * INFORMATION_SCHEMA. No hardcoded table lists, no FOREIGN_KEY_CHECKS toggling.
 *
 * Returns:
 *  - order: tables in FK-safe delete order (children before parents), topologically sorted
 *  - hasClientId: Set of tables that carry their own client_id column
 *  - selfRefs: table -> [self-referencing FK columns] (nulled before delete)
 *  - buildScope(table, alias): SQL predicate that scopes a table's rows to the tenant,
 *      walking correlated EXISTS subqueries up to the nearest client_id-bearing ancestor
 *      (used for child tables that have no client_id of their own)
 *  - retained: tables intentionally not purged
 *
 * Throws if the FK graph (excluding self-refs) is cyclic - we never relax referential
 * integrity, so an un-orderable graph must fail loudly rather than delete unsafely.
 */
const buildTenantDeletionPlan = async (transaction) => {
  const norm = (s) => String(s).toLowerCase();

  const edgeRows = await sequelize.query(
    `SELECT TABLE_NAME AS child, COLUMN_NAME AS col,
            REFERENCED_TABLE_NAME AS parent, REFERENCED_COLUMN_NAME AS pcol
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
    { type: QueryTypes.SELECT, transaction }
  );

  const cidRows = await sequelize.query(
    `SELECT TABLE_NAME AS t FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'client_id'`,
    { type: QueryTypes.SELECT, transaction }
  );
  const hasClientId = new Set(cidRows.map((r) => norm(r.t)));

  const fkOut = {};
  const selfRefs = {};
  const childrenOf = {};
  const parentsOf = {};
  for (const e of edgeRows) {
    const c = norm(e.child);
    const p = norm(e.parent);
    if (c === p) { (selfRefs[c] = selfRefs[c] || []).push(e.col); continue; }
    (fkOut[c] = fkOut[c] || []).push({ col: e.col, parent: p, pcol: e.pcol });
    (childrenOf[p] = childrenOf[p] || new Set()).add(c);
    (parentsOf[c] = parentsOf[c] || new Set()).add(p);
  }

  const excluded = new Set(['sequelizemeta', 'sequelize_meta', 'clients']);

  const inSet = new Set([...hasClientId].filter((t) => !excluded.has(t)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const parent of [...inSet]) {
      for (const child of (childrenOf[parent] || [])) {
        if (excluded.has(child)) continue;
        if (!inSet.has(child)) { inSet.add(child); grew = true; }
      }
    }
  }

  const pendingChildren = {};
  inSet.forEach((n) => {
    pendingChildren[n] = 0;
    for (const child of (childrenOf[n] || [])) if (inSet.has(child)) pendingChildren[n]++;
  });
  const parentLinks = {};
  for (const child of inSet) {
    for (const p of (parentsOf[child] || [])) {
      if (inSet.has(p)) (parentLinks[child] = parentLinks[child] || []).push(p);
    }
  }
  let queue = [...inSet].filter((n) => pendingChildren[n] === 0).sort();
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const p of (parentLinks[n] || [])) {
      pendingChildren[p]--;
      if (pendingChildren[p] === 0) { queue.push(p); queue.sort(); }
    }
  }
  const cyclic = [...inSet].filter((n) => !order.includes(n));
  if (cyclic.length) {
    throw new Error(
      `Cannot compute an FK-safe deletion order (cycle involving: ${cyclic.join(', ')}). ` +
      `Aborting tenant delete rather than relaxing referential integrity.`
    );
  }

  const buildScope = (table, alias, depth = 0) => {
    if (hasClientId.has(table)) return `${alias}.\`client_id\` = :cid`;
    if (depth > 8) return '0';
    const clauses = [];
    for (const f of (fkOut[table] || [])) {
      const pa = `s${depth}_${clauses.length}`;
      const inner = buildScope(f.parent, `\`${pa}\``, depth + 1);
      if (inner === '0') continue;
      clauses.push(
        `EXISTS (SELECT 1 FROM \`${f.parent}\` \`${pa}\` ` +
        `WHERE \`${pa}\`.\`${f.pcol}\` = ${alias}.\`${f.col}\` AND (${inner}))`
      );
    }
    return clauses.length ? `(${clauses.join(' OR ')})` : '0';
  };

  return { order, inSet, hasClientId, selfRefs, fkOut, buildScope, retained: [] };
};

exports.getClients = async (req, res) => {
  try {
    const clients = await Client.findAll({
      include: [{ model: ClientLicense, as: 'licenses' }]
    });
    return sendSuccess(res, clients);
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.createClient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { client_name, contact_person, email, phone, company_type, subdomain, entity_id, initial_plan } = req.body;

    // Check if client exists
    const existing = await Client.findOne({ where: { email } });
    if (existing) {
      await transaction.rollback();
      return sendError(res, 'Client with this email already exists', 400);
    }

    const client = await Client.create({
      client_name,
      contact_person,
      email,
      phone,
      company_type,
      subdomain,
      entity_id: entity_id || null
    }, { transaction });

    // Assign initial license
    if (initial_plan) {
      const maxAssets = normalizeLimit(initial_plan.max_assets, 100);
      const maxUsers = normalizeLimit(initial_plan.max_users, 10);
      await ClientLicense.create({
        client_id: client.id,
        plan_name: initial_plan.name || 'Standard',
        max_assets: maxAssets,
        max_users: maxUsers,
        start_date: new Date(),
        end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        status: 'ACTIVE'
      }, { transaction });
    }

    // Immutable audit trail — record client creation
    try {
      const payload = JSON.stringify({ client_id: client.id, client_name, email, subdomain, entity_id: entity_id || null });
      const hash = crypto.createHash('sha256').update(payload).digest('hex');
      await ImmutableAuditLog.create({
        entity_type: 'CLIENT',
        entity_id: client.id,
        action: 'CLIENT_CREATED',
        payload,
        user_id: req.user?.id || null,
        after_hash: hash
      }, { transaction });
    } catch { /* audit write failure must not block onboarding */ }

    // ENTERPRISE DEPRECIATION PROVISIONING (tenant-agnostic): every new client receives a
    // complete, working depreciation configuration automatically from the global defaults —
    // no manual setup. Atomic with onboarding: if this fails the whole onboarding rolls back.
    await provisionClientDepreciation(client.id, { transaction });

    await transaction.commit();

    // Welcome email — non-blocking, fail-open
    const loginUrl = subdomain ? `https://${subdomain}.fixtag.in` : 'https://fixtag.in';
    emailService.sendEmail({
      to: email,
      subject: `Welcome to Fixtag — ${client_name} is now onboarded`,
      html: `
        <h2>Welcome to Fixtag, ${contact_person || client_name}!</h2>
        <p>Your organisation <strong>${client_name}</strong> has been successfully onboarded to Fixtag FAMS.</p>
        <p>Your login portal: <a href="${loginUrl}">${loginUrl}</a></p>
        <p>Please log in and set up your Admin and Client Admin accounts.</p>
        <br/><p>— The Fixtag Team</p>
      `
    }).catch(() => {});

    return sendSuccess(res, client, 'Client onboarded successfully', 201);
  } catch (error) {
    await transaction.rollback();
    return sendError(res, error.message);
  }
};

exports.deleteClientTenantData = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const clientId = normalizeClientId(req.params.id);
    if (!clientId) {
      await transaction.rollback();
      return sendError(res, 'Valid client id is required', 400);
    }

    const existingClient = await Client.findByPk(clientId, { transaction });
    if (!existingClient) {
      await transaction.rollback();
      return sendError(res, 'Client not found', 404);
    }

    // Schema-driven plan: FK graph -> deletion closure -> topological (children-first) order.
    // Referential integrity is NEVER relaxed (no FOREIGN_KEY_CHECKS toggling).
    const plan = await buildTenantDeletionPlan(transaction);
    const repl = { cid: clientId };
    const affectedOf = (r) =>
      (Array.isArray(r) ? (r[1] && r[1].affectedRows != null ? r[1].affectedRows : (r[0] && r[0].affectedRows)) : (r && r.affectedRows)) || 0;

    // Pass 1 - break self-referencing FKs for this tenant's rows so a single-statement
    // DELETE can't hit an intra-table RESTRICT (e.g. assets.parent_asset_id,
    // asset_categories.parent_id). Scoped to the tenant only.
    for (const table of plan.order) {
      const cols = plan.selfRefs[table];
      if (!cols || !cols.length) continue;
      const scope = plan.hasClientId.has(table)
        ? '`client_id` = :cid'
        : plan.buildScope(table, `\`${table}\``);
      if (scope === '0') continue;
      const setClause = cols.map((c) => `\`${c}\` = NULL`).join(', ');
      await sequelize.query(`UPDATE \`${table}\` SET ${setClause} WHERE ${scope}`, {
        replacements: repl,
        transaction
      });
    }

    // Pass 2 - delete children before parents. client_id tables scope directly;
    // child tables without client_id scope through their tenant-owning ancestor.
    const purgedTables = [];
    for (const table of plan.order) {
      let scope;
      if (plan.hasClientId.has(table)) {
        scope = '`client_id` = :cid';
      } else {
        scope = plan.buildScope(table, `\`${table}\``);
        if (scope === '0') continue; // not attributable to any tenant - leave untouched
      }
      const result = await sequelize.query(`DELETE FROM \`${table}\` WHERE ${scope}`, {
        replacements: repl,
        transaction
      });
      const deleted = affectedOf(result);
      if (deleted > 0) purgedTables.push({ table, deleted });
    }

    // Pass 3 - delete the client row itself and assert exactly one row went.
    const destroyed = await Client.destroy({ where: { id: clientId }, transaction });
    if (destroyed !== 1) {
      throw new Error(`Expected to delete exactly 1 client row, deleted ${destroyed}`);
    }

    // In-transaction verification before commit.
    const stillPresent = await Client.findByPk(clientId, { transaction });
    if (stillPresent) {
      throw new Error('Client row still present after delete - aborting');
    }

    await transaction.commit();

    // Post-commit verification - confirm the client truly no longer exists.
    const postCheck = await Client.findByPk(clientId);
    if (postCheck) {
      return sendError(res, 'Client deletion did not persist', 500);
    }

    const totalRowsDeleted = purgedTables.reduce((s, t) => s + t.deleted, 0) + 1; // + the client row
    return sendSuccess(
      res,
      {
        client_id: clientId,
        deleted: true,
        tables_in_purge: plan.order,
        purged_tables: purgedTables,
        total_tables_evaluated: plan.order.length,
        total_rows_deleted: totalRowsDeleted,
        retained_tables: plan.retained
      },
      'Tenant and client fully deleted'
    );
  } catch (error) {
    await transaction.rollback();
    return sendError(res, error.message);
  }
};

exports.previewClientTenantPurge = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const clientId = normalizeClientId(req.params.id);
    if (!clientId) {
      await transaction.rollback();
      return sendError(res, 'Valid client id is required', 400);
    }

    const existingClient = await Client.findByPk(clientId, { transaction });
    if (!existingClient) {
      await transaction.rollback();
      return sendError(res, 'Client not found', 404);
    }

    // Use the exact same schema-driven plan the delete uses, so the pre-confirm
    // preview matches precisely what will be removed (incl. child tables without
    // their own client_id, scoped through their tenant-owning parent).
    const plan = await buildTenantDeletionPlan(transaction);
    const impacted = [];
    for (const table of plan.order) {
      const scope = plan.hasClientId.has(table)
        ? '`client_id` = :cid'
        : plan.buildScope(table, `\`${table}\``);
      if (scope === '0') continue;
      const rows = await sequelize.query(
        `SELECT COUNT(*) AS cnt FROM \`${table}\` WHERE ${scope}`,
        { replacements: { cid: clientId }, type: QueryTypes.SELECT, transaction }
      );
      const cnt = Number(rows?.[0]?.cnt || 0);
      if (cnt > 0) impacted.push({ table, rows: cnt });
    }
    await transaction.commit();

    return sendSuccess(res, {
      client_id: clientId,
      client_name: existingClient.client_name,
      impacted_tables: impacted,
      tables_in_purge: plan.order,
      retained_tables: plan.retained
    });
  } catch (error) {
    await transaction.rollback();
    return sendError(res, error.message);
  }
};

exports.getLicenses = async (req, res) => {
  try {
    const licenses = await ClientLicense.findAll({
      include: [{ model: Client, as: 'client', attributes: ['client_name'] }]
    });
    return sendSuccess(res, licenses);
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.createLicense = async (req, res) => {
  try {
    const clientId = normalizeClientId(req.body?.client_id);
    if (!clientId) {
      return sendError(res, 'Valid client id is required', 400);
    }
    const clientExists = await Client.findByPk(clientId);
    if (!clientExists) {
      return sendError(res, 'Client not found', 404);
    }
    const payload = {
      ...req.body,
      client_id: clientId,
      max_assets: normalizeLimit(req.body?.max_assets, 100),
      max_users: normalizeLimit(req.body?.max_users, 10)
    };
    const license = await ClientLicense.create(payload);
    return sendSuccess(res, license, 'License created successfully', 201);
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.updateLicense = async (req, res) => {
  try {
    const licenseId = Number(req.params.id);
    if (!Number.isInteger(licenseId) || licenseId <= 0) {
      return sendError(res, 'Valid license id is required', 400);
    }
    const license = await ClientLicense.findByPk(licenseId);
    if (!license) return sendError(res, 'License not found', 404);

    const updates = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updates, 'max_assets')) {
      updates.max_assets = normalizeLimit(updates.max_assets, license.max_assets);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'max_users')) {
      updates.max_users = normalizeLimit(updates.max_users, license.max_users);
    }
    await license.update(updates);
    return sendSuccess(res, license, 'License updated successfully');
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.getSupportTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.findAll({
      include: [{ model: Client, as: 'client', attributes: ['client_name'] }]
    });
    return sendSuccess(res, tickets);
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.createSupportTicket = async (req, res) => {
  try {
    const clientId = normalizeClientId(req.body?.client_id);
    if (!clientId) {
      return sendError(res, 'Valid client id is required', 400);
    }
    const clientExists = await Client.findByPk(clientId);
    if (!clientExists) {
      return sendError(res, 'Client not found', 404);
    }
    const ticket = await SupportTicket.create({ ...req.body, client_id: clientId });
    return sendSuccess(res, ticket, 'Support ticket created successfully', 201);
  } catch (error) {
    return sendError(res, error.message);
  }
};

exports.checkLicenseLimits = async (req, res) => {
  try {
    const clientId = normalizeClientId(req.query?.client_id);
    const whereByClient = clientId ? { client_id: clientId } : {};

    const [assetCount, userCount] = await Promise.all([
      Asset.count({ where: { is_active: true, ...whereByClient } }),
      User.count({ where: { status: 'ACTIVE', ...whereByClient } })
    ]);
    return sendSuccess(res, {
      asset_count: assetCount,
      user_count: userCount,
      client_id: clientId || 'ALL'
    });
  } catch (error) {
    return sendError(res, error.message);
  }
};

// Internal export for verification/tests (additive; no runtime behavior change)
exports.buildTenantDeletionPlan = buildTenantDeletionPlan;
