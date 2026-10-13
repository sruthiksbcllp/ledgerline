'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    // ── client_licenses ────────────────────────────────────────────────────────
    if (!tables.includes('client_licenses')) {
      await queryInterface.createTable('client_licenses', {
        id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id:  { type: Sequelize.INTEGER, allowNull: false },
        plan_name:  { type: Sequelize.STRING, allowNull: false, defaultValue: 'ENTERPRISE' },
        max_assets: { type: Sequelize.INTEGER, defaultValue: 100 },
        max_users:  { type: Sequelize.INTEGER, defaultValue: 10 },
        start_date: { type: Sequelize.DATE },
        end_date:   { type: Sequelize.DATE },
        status:     { type: Sequelize.ENUM('ACTIVE','EXPIRED'), defaultValue: 'ACTIVE' },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    // ── support_tickets ───────────────────────────────────────────────────────
    if (!tables.includes('support_tickets')) {
      await queryInterface.createTable('support_tickets', {
        id:          { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id:   { type: Sequelize.INTEGER, allowNull: false },
        raised_by:   { type: Sequelize.INTEGER },
        subject:     { type: Sequelize.STRING, allowNull: false },
        description: { type: Sequelize.TEXT },
        category:    { type: Sequelize.STRING(50) },
        priority:    { type: Sequelize.ENUM('LOW','MEDIUM','HIGH'), defaultValue: 'MEDIUM' },
        status:      { type: Sequelize.ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED'), defaultValue: 'OPEN' },
        created_at:  { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at:  { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    // ── immutable_audit_log ───────────────────────────────────────────────────
    if (!tables.includes('immutable_audit_log')) {
      await queryInterface.createTable('immutable_audit_log', {
        id:          { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id:   { type: Sequelize.INTEGER },
        user_id:     { type: Sequelize.INTEGER },
        action:      { type: Sequelize.STRING(100) },
        module:      { type: Sequelize.STRING(50) },
        entity_type: { type: Sequelize.STRING(50) },
        entity_id:   { type: Sequelize.INTEGER },
        before_hash: { type: Sequelize.STRING(64) },
        after_hash:  { type: Sequelize.STRING(64) },
        payload:     { type: Sequelize.JSON },
        ip_address:  { type: Sequelize.STRING(45) },
        user_agent:  { type: Sequelize.TEXT },
        created_at:  { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    // ── asset_alerts ──────────────────────────────────────────────────────────
    if (!tables.includes('asset_alerts')) {
      await queryInterface.createTable('asset_alerts', {
        id:          { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id:   { type: Sequelize.INTEGER },
        asset_id:    { type: Sequelize.INTEGER },
        location_id: { type: Sequelize.INTEGER },
        alert_type:  { type: Sequelize.STRING(50), allowNull: false },
        title:       { type: Sequelize.STRING },
        description: { type: Sequelize.TEXT },
        priority:    { type: Sequelize.ENUM('LOW','MEDIUM','HIGH','CRITICAL'), defaultValue: 'MEDIUM' },
        status:      { type: Sequelize.ENUM('OPEN','ACKNOWLEDGED','RESOLVED'), defaultValue: 'OPEN' },
        resolved_at: { type: Sequelize.DATE },
        created_at:  { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at:  { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    // ── featuretoggles ────────────────────────────────────────────────────────
    if (!tables.includes('featuretoggles')) {
      await queryInterface.createTable('featuretoggles', {
        id:           { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        feature_key:  { type: Sequelize.STRING, allowNull: false, unique: true },
        feature_name: { type: Sequelize.STRING, allowNull: false },
        module:       { type: Sequelize.STRING, allowNull: false },
        is_enabled:   { type: Sequelize.BOOLEAN, defaultValue: true },
        createdAt:    { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt:    { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('client_licenses').catch(() => {});
    await queryInterface.dropTable('support_tickets').catch(() => {});
    await queryInterface.dropTable('immutable_audit_log').catch(() => {});
    await queryInterface.dropTable('asset_alerts').catch(() => {});
    await queryInterface.dropTable('featuretoggles').catch(() => {});
  }
};
