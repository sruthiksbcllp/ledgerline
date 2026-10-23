'use strict';
const { Op } = require('sequelize');

/**
 * Gap 16: Segregation of Duties Service
 */

const DEFAULT_CONFLICTS = [
  { action_a: 'ASSET_CREATE', action_b: 'ASSET_APPROVE', description: 'Creator cannot approve own asset' },
  { action_a: 'ASSET_DELETE', action_b: 'ASSET_DISPOSE', description: 'Deleter cannot dispose same asset' },
  { action_a: 'PO_CREATE', action_b: 'PO_APPROVE', description: 'PO creator cannot approve own PO' },
  { action_a: 'PR_CREATE', action_b: 'PR_APPROVE', description: 'PR requester cannot approve own PR' },
  { action_a: 'GRN_CREATE', action_b: 'INVOICE_APPROVE', description: 'GRN receiver cannot approve invoice' },
  { action_a: 'VENDOR_CREATE', action_b: 'VENDOR_APPROVE', description: 'Vendor creator cannot approve vendor' },
  { action_a: 'DISPOSAL_REQUEST', action_b: 'DISPOSAL_APPROVE', description: 'Disposal requester cannot approve' }
];

async function seedDefaultRules(clientId) {
  const { SodConflictRule } = require('../models');
  for (const rule of DEFAULT_CONFLICTS) {
    await SodConflictRule.findOrCreate({
      where: { client_id: clientId, action_a: rule.action_a, action_b: rule.action_b },
      defaults: { ...rule, client_id: clientId, severity: 'BLOCK', is_active: true }
    });
  }
}

async function checkConflict(userId, action, entityType, entityId, clientId) {
  const { SodConflictRule, SodViolation } = require('../models');
  const { ImmutableAuditLog } = require('../models');

  const rules = await SodConflictRule.findAll({
    where: { client_id: clientId, is_active: true, [Op.or]: [{ action_a: action }, { action_b: action }] }
  });

  for (const rule of rules) {
    const conflictingAction = rule.action_a === action ? rule.action_b : rule.action_a;

    // Check if this user previously performed the conflicting action on the same entity
    let hasConflict = false;
    try {
      const auditLog = require('../models').ImmutableAuditLog || require('../models').immutable_audit_log;
      if (auditLog) {
        const prior = await auditLog.findOne({
          where: { user_id: userId, action: conflictingAction, entity_type: entityType, entity_id: entityId }
        });
        hasConflict = !!prior;
      }
    } catch { /* audit log model may not exist */ }

    if (hasConflict) {
      // Log violation
      await SodViolation.create({
        client_id: clientId,
        user_id: userId,
        rule_id: rule.id,
        action_performed: action,
        entity_type: entityType,
        entity_id: entityId
      });

      if (rule.severity === 'BLOCK') {
        return { blocked: true, rule, message: rule.description };
      }
      return { blocked: false, warning: true, rule, message: `SOD Warning: ${rule.description}` };
    }
  }

  return { blocked: false, warning: false };
}

async function getViolationReport(clientId, { startDate, endDate } = {}) {
  const { SodViolation, SodConflictRule } = require('../models');
  const where = {};
  if (clientId) where.client_id = clientId;
  if (startDate && endDate) {
    where.detected_at = { [Op.between]: [startDate, endDate] };
  }

  return SodViolation.findAll({
    where,
    include: [{ model: SodConflictRule, as: 'rule' }],
    order: [['detected_at', 'DESC']],
    limit: 500
  });
}

module.exports = { seedDefaultRules, checkConflict, getViolationReport, DEFAULT_CONFLICTS };
