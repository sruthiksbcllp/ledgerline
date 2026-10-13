'use strict';

/**
 * 20260504170000-fix-assets-all-missing-columns.js
 *
 * Adds ALL columns present in the Asset model but missing from the assets table.
 * Primary fix: po_date (causes "Unknown column" 500 on GET /api/assets/:id)
 * Also covers all other model fields not in original migration.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const addIfMissing = async (col, def) => {
      try {
        const desc = await queryInterface.describeTable('assets');
        if (!desc[col]) await queryInterface.addColumn('assets', col, def);
      } catch (_) {}
    };

    // Procurement traceability fields
    await addIfMissing('po_date',               { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('po_number',             { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('po_id',                 { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('grn_id',                { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('grn_item_id',           { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('invoice_id',            { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('direct_procurement_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('request_id',            { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('cwip_project_id',       { type: Sequelize.INTEGER, allowNull: true });

    // Asset identification
    await addIfMissing('serial_number',         { type: Sequelize.STRING(200), allowNull: true });
    await addIfMissing('tag_code',              { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('make',                  { type: Sequelize.STRING(200), allowNull: true });
    await addIfMissing('model',                 { type: Sequelize.STRING(200), allowNull: true });
    await addIfMissing('property_name',         { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('sub_department',        { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('sub_location',          { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('vendor_name',           { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('vendor_id',             { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('custodian_id',          { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('last_movement_id',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('it_act_block_id',       { type: Sequelize.STRING(50), allowNull: true });

    // Financial fields
    await addIfMissing('purchase_cost',         { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('total_cost',            { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('freight_charges',       { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('installation_charges',  { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('onetime_charges',       { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('other_charges',         { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('gst_eligible',          { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('is_under_amc',          { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('is_disposed',           { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('profit_loss',           { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });

    // Dates
    await addIfMissing('put_to_use_date',           { type: Sequelize.DATEONLY, allowNull: true });
    await addIfMissing('capitalization_date',        { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('depreciation_upto_date',     { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('depreciation_start_date',    { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('last_moved_at',              { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('last_verified_date',         { type: Sequelize.DATE, allowNull: true });

    // Depreciation — Companies Act
    await addIfMissing('useful_life',                       { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('useful_life_years',                 { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('residual_value',                    { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('depreciation_method',               { type: Sequelize.STRING(20), defaultValue: 'SLM' });
    await addIfMissing('opening_wdv',                       { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('accumulated_depreciation_opening',  { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('companies_act_depreciation',        { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('companies_act_accumulated',         { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('companies_act_nbv',                 { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('co_act_dep_slm_annual',             { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('co_act_dep_wdv_annual',             { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('co_act_accumulated_dep',            { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('co_act_wdv_remaining',              { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('co_act_residual_value',             { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('co_act_depreciation_method',        { type: Sequelize.STRING(10), defaultValue: 'SLM' });

    // Depreciation — IT Act
    await addIfMissing('it_act_depreciation',     { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('it_act_accumulated',      { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('it_act_wdv',              { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('it_act_dep_wdv_rate',     { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 });
    await addIfMissing('it_act_dep_annual',       { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('it_act_accumulated_dep',  { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('it_act_wdv_remaining',    { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('it_act_half_year_rule',   { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('it_act_fy',               { type: Sequelize.STRING(10), allowNull: true });

    // Status / classification
    await addIfMissing('source_type', {
      type: Sequelize.ENUM('MANUAL', 'REQUEST', 'GRN', 'CWIP'), defaultValue: 'MANUAL'
    });
    await addIfMissing('asset_status', {
      type: Sequelize.ENUM('ACTIVE', 'DISPOSED', 'MISSING'), defaultValue: 'ACTIVE'
    });
    await addIfMissing('verification_status', {
      type: Sequelize.ENUM('VERIFIED', 'NOT VERIFIED', 'UNVERIFIED', 'MISSING'), defaultValue: 'UNVERIFIED'
    });
    await addIfMissing('depreciation_source', {
      type: Sequelize.ENUM('COMPANIES_ACT', 'IT_ACT'), defaultValue: 'COMPANIES_ACT'
    });
    await addIfMissing('schedule_ii_classification', { type: Sequelize.STRING(200), allowNull: true });
    await addIfMissing('shift_type',     { type: Sequelize.STRING(10), defaultValue: 'single' });
    await addIfMissing('client_id',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('region_id',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('sub_department_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('remarks',        { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('updated_by',     { type: Sequelize.INTEGER, allowNull: true });
  },

  down: async () => {}
};
