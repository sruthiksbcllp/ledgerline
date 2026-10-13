'use strict';

/**
 * 20260504160000-fix-asset-code-config-and-remaining.js
 *
 * Fixes:
 * 1. asset_code_config — table created with prefix/next_sequence/padding_length
 *    but model expects code_mode/sequence_length/allow_manual_override/is_active
 *
 * 2. assets table — grn_id column used in getAssetByCode include chain via GRN association
 *    Also purchase_cost (used in createGRN asset creation)
 *
 * 3. self_declaration_campaigns — campaign_name NOT NULL constraint causes insert failures
 *    (title exists but campaign_name may be null after copy)
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

    // ── asset_code_config ─────────────────────────────────────────────────
    // Model fields: code_mode, prefix, sequence_length, allow_manual_override, is_active
    // Table fields: prefix, next_sequence, padding_length
    await addIfMissing('asset_code_config', 'code_mode', {
      type: Sequelize.ENUM('ERP', 'AUTO', 'CUSTOM'),
      allowNull: false,
      defaultValue: 'AUTO'
    });
    await addIfMissing('asset_code_config', 'sequence_length', {
      type: Sequelize.INTEGER, defaultValue: 4
    });
    // copy padding_length -> sequence_length
    if (await tableExists('asset_code_config') && await hasColumn('asset_code_config', 'padding_length')) {
      await queryInterface.sequelize.query(
        'UPDATE asset_code_config SET sequence_length = padding_length WHERE sequence_length = 4'
      );
    }
    await addIfMissing('asset_code_config', 'allow_manual_override', {
      type: Sequelize.BOOLEAN, defaultValue: false
    });
    await addIfMissing('asset_code_config', 'is_active', {
      type: Sequelize.BOOLEAN, defaultValue: true
    });

    // ── assets — purchase_cost (used by GRN asset creation) ──────────────
    await addIfMissing('assets', 'purchase_cost', {
      type: Sequelize.DECIMAL(15, 2), defaultValue: 0
    });
    // copy total_price -> purchase_cost for existing assets
    if (await tableExists('assets') && await hasColumn('assets', 'total_price')) {
      await queryInterface.sequelize.query(
        'UPDATE assets SET purchase_cost = total_price WHERE purchase_cost = 0 AND total_price IS NOT NULL'
      );
    }

    // grn_id on assets (traceability from GRN inward)
    await addIfMissing('assets', 'grn_id', { type: Sequelize.INTEGER, allowNull: true });

    // serial_number on assets
    await addIfMissing('assets', 'serial_number', { type: Sequelize.STRING(200), allowNull: true });

    // ── self_declaration_campaigns — ensure campaign_name populated ───────
    if (await tableExists('self_declaration_campaigns')) {
      if (await hasColumn('self_declaration_campaigns', 'title') &&
          await hasColumn('self_declaration_campaigns', 'campaign_name')) {
        await queryInterface.sequelize.query(
          'UPDATE self_declaration_campaigns SET campaign_name = COALESCE(campaign_name, title, "Untitled Campaign")'
        );
      }
    }

    // ── self_declaration_responses — ensure declaration_status populated ──
    if (await tableExists('self_declaration_responses')) {
      if (await hasColumn('self_declaration_responses', 'declaration_status')) {
        await queryInterface.sequelize.query(
          "UPDATE self_declaration_responses SET declaration_status = 'PENDING' WHERE declaration_status IS NULL"
        );
      }
    }
  },

  down: async () => {}
};
