'use strict';

const { ImmutableAuditLog } = require('../models');
const auditHasher = require('../utils/auditHasher');

class ImmutableAuditService {
  async log(params = {}) {
    try {
      const beforeData = params.beforeData ?? null;
      const afterData = params.afterData ?? null;
      await ImmutableAuditLog.create({
        client_id: params.clientId || null,
        user_id: params.userId || null,
        action: params.action || 'UNKNOWN',
        module: params.module || 'SYSTEM',
        entity_type: params.entityType || 'UNKNOWN',
        entity_id: params.entityId || null,
        before_hash: beforeData ? auditHasher.hash(beforeData) : null,
        after_hash: afterData ? auditHasher.hash(afterData) : null,
        payload: { beforeData, afterData },
        ip_address: params.req?.ip || params.req?.socket?.remoteAddress || null,
        user_agent: params.req?.headers?.['user-agent'] || null
      });
    } catch (_e) {
      // Swallow by design: audit failures must never break primary flow.
    }
  }

  async resolveEntityId(entityType, rawInput, clientId) {
    const numeric = Number(rawInput);
    if (!isNaN(numeric) && String(rawInput).trim() !== '') return numeric;

    const { sequelize } = require('../models');
    const client = clientId ? 'AND client_id = :clientId' : '';

    const queries = {
      ASSET:   `SELECT id FROM assets   WHERE (asset_code = :v OR serial_number = :v) ${client} LIMIT 1`,
      USER:    `SELECT id FROM users    WHERE (username = :v OR email = :v) LIMIT 1`,
      VENDOR:  `SELECT id FROM vendors  WHERE (name = :v OR vendor_code = :v) ${client} LIMIT 1`,
      ROLE:    `SELECT id FROM roles    WHERE (name = :v OR code = :v) LIMIT 1`,
      PO:      `SELECT id FROM purchaseorders WHERE po_number = :v ${client} LIMIT 1`,
      PR:      `SELECT id FROM purchaserequisitions WHERE pr_number = :v ${client} LIMIT 1`,
      GRN:     `SELECT id FROM grns      WHERE grn_number = :v ${client} LIMIT 1`,
      INVOICE: `SELECT id FROM invoices  WHERE invoice_number = :v ${client} LIMIT 1`,
    };

    const sql = queries[entityType];
    if (!sql) return null;

    const rows = await sequelize.query(sql, {
      replacements: { v: rawInput, clientId: clientId || null },
      type: sequelize.QueryTypes.SELECT,
    });
    return rows[0]?.id ?? null;
  }

  async getAuditTrail(entityType, rawInput, clientId) {
    const entityId = await this.resolveEntityId(entityType, rawInput, clientId);
    if (!entityId) return [];
    const where = { entity_type: entityType, entity_id: entityId };
    if (clientId) where.client_id = clientId;
    return ImmutableAuditLog.findAll({ where, order: [['created_at', 'DESC']] });
  }

  async getByActor(username, clientId) {
    const { sequelize } = require('../models');
    const where = clientId ? 'AND a.client_id = :clientId' : '';
    const rows = await sequelize.query(
      `SELECT a.*, u.username, u.first_name, u.last_name
       FROM immutable_audit_log a
       JOIN users u ON u.id = a.user_id
       WHERE u.username = :username ${where}
       ORDER BY a.created_at DESC
       LIMIT 500`,
      { replacements: { username, clientId: clientId || null }, type: sequelize.QueryTypes.SELECT }
    );
    return rows;
  }

  async getRecent(clientId, limit = 100) {
    const { sequelize } = require('../models');
    const sql = clientId
      ? `SELECT a.*, u.username, u.first_name, u.last_name
         FROM immutable_audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.client_id = :clientId
         ORDER BY a.created_at DESC
         LIMIT :limit`
      : `SELECT a.*, u.username, u.first_name, u.last_name
         FROM immutable_audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC
         LIMIT :limit`;
    return sequelize.query(sql, {
      replacements: { clientId: clientId || null, limit },
      type: sequelize.QueryTypes.SELECT,
    });
  }

  /**
   * SIEM / bulk export — machine-friendly log retrieval with date-range,
   * action, module, and user_id filters plus cursor-based pagination.
   *
   * Returns { rows, total, limit, offset, hasMore }.
   */
  async exportLogs({ clientId, since, until, action, module, userId, entityType, limit = 1000, offset = 0 } = {}) {
    const { Op } = require('../models').Sequelize;
    const where = {};

    if (clientId) where.client_id = clientId;

    if (since || until) {
      where.created_at = {};
      if (since) where.created_at[Op.gte] = new Date(since);
      if (until) where.created_at[Op.lte] = new Date(until);
    }

    if (action)     where.action      = action;
    if (module)     where.module      = module;
    if (userId)     where.user_id     = userId;
    if (entityType) where.entity_type = entityType;

    const safeLimit  = Math.min(Math.max(parseInt(limit) || 1000, 1), 10000);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    const { count, rows } = await ImmutableAuditLog.findAndCountAll({
      where,
      order: [['created_at', 'ASC']],
      limit: safeLimit,
      offset: safeOffset,
      attributes: [
        'id', 'client_id', 'user_id', 'action', 'module',
        'entity_type', 'entity_id', 'before_hash', 'after_hash',
        'payload', 'ip_address', 'user_agent', 'created_at'
      ],
      raw: true,
    });

    return {
      rows,
      total: count,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + safeLimit < count,
    };
  }

  async verifyIntegrity(id) {
    const row = await ImmutableAuditLog.findByPk(id);
    if (!row) return null;
    const payload = row.payload || {};
    const beforeOk = !payload.beforeData || auditHasher.verify(payload.beforeData, row.before_hash);
    const afterOk = !payload.afterData || auditHasher.verify(payload.afterData, row.after_hash);
    return { id: row.id, verified: Boolean(beforeOk && afterOk), beforeOk, afterOk };
  }
}

module.exports = new ImmutableAuditService();
