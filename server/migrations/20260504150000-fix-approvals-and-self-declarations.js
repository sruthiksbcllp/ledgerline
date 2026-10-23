'use strict';

/**
 * 20260504150000-fix-approvals-and-self-declarations.js
 *
 * Fixes column mismatches for:
 *
 * 1. approval_workflows — missing approval_topology, progression_mode columns
 *    (model has them, table created by 20260501210000 without them)
 *
 * 2. self_declaration_campaigns — table has: title, description, deadline
 *    model expects: campaign_name, scope_type, scope_id, start_date, due_date, instructions
 *
 * 3. self_declaration_responses — table has: user_id, condition, remarks, submitted_at
 *    model expects: custodian_id, declaration_status, condition_status,
 *                   current_location, evidence_json, declared_at
 *
 * 4. tagtemplates — check for missing columns vs tag controller
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const hasColumn = async (table, column) => {
      try {
        const desc = await queryInterface.describeTable(table);
        return Object.prototype.hasOwnProperty.call(desc, column);
      } catch (_) { return false; }
    };
    const tableExists = async (table) => {
      try { await queryInterface.describeTable(table); return true; }
      catch (_) { return false; }
    };
    const addIfMissing = async (table, column, def) => {
      if (await tableExists(table) && !(await hasColumn(table, column))) {
        await queryInterface.addColumn(table, column, def);
      }
    };

    // ── approval_workflows ──────────────────────────────────────────────────
    await addIfMissing('approval_workflows', 'approval_topology', {
      type: Sequelize.ENUM('COLLECTIVE', 'LINE_LEVEL'), defaultValue: 'COLLECTIVE'
    });
    await addIfMissing('approval_workflows', 'progression_mode', {
      type: Sequelize.ENUM('COLLECTIVE', 'PER_LINE'), defaultValue: 'COLLECTIVE'
    });

    // ── self_declaration_campaigns ──────────────────────────────────────────
    // model uses campaign_name; table was created with title — add alias
    await addIfMissing('self_declaration_campaigns', 'campaign_name', {
      type: Sequelize.STRING(255), allowNull: true
    });
    // copy title -> campaign_name for existing rows
    if (await tableExists('self_declaration_campaigns') && await hasColumn('self_declaration_campaigns', 'title')) {
      await queryInterface.sequelize.query(
        'UPDATE self_declaration_campaigns SET campaign_name = title WHERE campaign_name IS NULL'
      );
    }
    await addIfMissing('self_declaration_campaigns', 'scope_type', {
      type: Sequelize.ENUM('ALL_ASSETS', 'DEPARTMENT', 'LOCATION', 'CUSTODIAN'),
      defaultValue: 'ALL_ASSETS'
    });
    await addIfMissing('self_declaration_campaigns', 'scope_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('self_declaration_campaigns', 'start_date', { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('self_declaration_campaigns', 'due_date',   { type: Sequelize.DATE, allowNull: true });
    // copy deadline -> due_date for existing rows
    if (await tableExists('self_declaration_campaigns') && await hasColumn('self_declaration_campaigns', 'deadline')) {
      await queryInterface.sequelize.query(
        'UPDATE self_declaration_campaigns SET due_date = deadline WHERE due_date IS NULL'
      );
    }
    await addIfMissing('self_declaration_campaigns', 'instructions', { type: Sequelize.TEXT, allowNull: true });

    // ── self_declaration_responses ──────────────────────────────────────────
    await addIfMissing('self_declaration_responses', 'client_id',  { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('self_declaration_responses', 'custodian_id', { type: Sequelize.INTEGER, allowNull: true });
    // copy user_id -> custodian_id for existing rows
    if (await tableExists('self_declaration_responses') && await hasColumn('self_declaration_responses', 'user_id')) {
      await queryInterface.sequelize.query(
        'UPDATE self_declaration_responses SET custodian_id = user_id WHERE custodian_id IS NULL'
      );
    }
    await addIfMissing('self_declaration_responses', 'declaration_status', {
      type: Sequelize.ENUM('PENDING', 'CONFIRMED', 'MISMATCH', 'NOT_FOUND', 'DAMAGED'),
      defaultValue: 'PENDING'
    });
    await addIfMissing('self_declaration_responses', 'condition_status', {
      type: Sequelize.ENUM('GOOD', 'FAIR', 'POOR', 'DAMAGED', 'NOT_FOUND'),
      defaultValue: 'GOOD'
    });
    await addIfMissing('self_declaration_responses', 'current_location', { type: Sequelize.STRING(500), allowNull: true });
    await addIfMissing('self_declaration_responses', 'evidence_json',    { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('self_declaration_responses', 'declared_at',      { type: Sequelize.DATE, allowNull: true });

    // ── tagtemplates ────────────────────────────────────────────────────────
    await addIfMissing('tagtemplates', 'client_id',       { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('tagtemplates', 'template_name',   { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('tagtemplates', 'fields_config',   { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('tagtemplates', 'qr_size',         { type: Sequelize.INTEGER, defaultValue: 200 });
    await addIfMissing('tagtemplates', 'label_width',     { type: Sequelize.INTEGER, defaultValue: 300 });
    await addIfMissing('tagtemplates', 'label_height',    { type: Sequelize.INTEGER, defaultValue: 150 });
    await addIfMissing('tagtemplates', 'is_default',      { type: Sequelize.BOOLEAN, defaultValue: false });

    // ── approval_matrix — ensure module_name + role_code exist (safety) ─────
    await addIfMissing('approval_matrix', 'module_name', { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('approval_matrix', 'role_code',   { type: Sequelize.STRING(100), allowNull: true });
  },

  down: async () => {}
};
