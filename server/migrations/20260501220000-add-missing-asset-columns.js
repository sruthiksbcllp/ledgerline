'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const addIfMissing = async (table, col, def) => {
      try {
        const desc = await queryInterface.describeTable(table);
        if (!desc[col]) await queryInterface.addColumn(table, col, def);
      } catch (e) {
        // table doesn't exist yet — skip
      }
    };

    // Assets table — columns that exist in the model but were never migrated
    await addIfMissing('assets', 'is_disposed', { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('assets', 'profit_loss',  { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('assets', 'total_cost',   { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('assets', 'companies_act_depreciation', { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('assets', 'companies_act_nbv',         { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('assets', 'it_act_depreciation',       { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('assets', 'it_act_wdv',                { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('assets', 'verification_status', {
      type: Sequelize.ENUM('VERIFIED', 'NOT VERIFIED', 'UNVERIFIED', 'MISSING'),
      defaultValue: 'UNVERIFIED'
    });
    await addIfMissing('assets', 'asset_status', {
      type: Sequelize.ENUM('ACTIVE', 'DISPOSED', 'MISSING'),
      defaultValue: 'ACTIVE'
    });
    await addIfMissing('assets', 'client_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assets', 'schedule_ii_classification', { type: Sequelize.STRING(200) });
    await addIfMissing('assets', 'shift_type', { type: Sequelize.STRING(10), defaultValue: 'single' });
    await addIfMissing('assets', 'custodian_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assets', 'vendor_id',    { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assets', 'po_id',        { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assets', 'invoice_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assets', 'grn_item_id',  { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assets', 'direct_procurement_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assets', 'source_type', {
      type: Sequelize.ENUM('MANUAL', 'REQUEST', 'GRN', 'CWIP'),
      defaultValue: 'MANUAL'
    });
    await addIfMissing('assets', 'tag_code', { type: Sequelize.STRING(100), unique: true });
    await addIfMissing('assets', 'useful_life', { type: Sequelize.INTEGER });
    await addIfMissing('assets', 'put_to_use_date', { type: Sequelize.DATEONLY });
    await addIfMissing('assets', 'residual_value', { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('assets', 'depreciation_method', { type: Sequelize.STRING, defaultValue: 'SLM' });
    await addIfMissing('assets', 'opening_wdv', { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('assets', 'co_act_dep_slm_annual', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('assets', 'co_act_dep_wdv_annual', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('assets', 'co_act_accumulated_dep', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('assets', 'co_act_wdv_remaining', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('assets', 'co_act_residual_value', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('assets', 'co_act_depreciation_method', { type: Sequelize.STRING(10), defaultValue: 'SLM' });
    await addIfMissing('assets', 'it_act_accumulated', { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });
    await addIfMissing('assets', 'it_act_dep_wdv_rate', { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 });
    await addIfMissing('assets', 'it_act_dep_annual', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('assets', 'it_act_accumulated_dep', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('assets', 'it_act_wdv_remaining', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    await addIfMissing('assets', 'it_act_half_year_rule', { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('assets', 'depreciation_source', {
      type: Sequelize.ENUM('COMPANIES_ACT', 'IT_ACT'),
      defaultValue: 'COMPANIES_ACT'
    });
    await addIfMissing('assets', 'gst_eligible', { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('assets', 'freight_charges', { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('assets', 'installation_charges', { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('assets', 'onetime_charges', { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('assets', 'other_charges', { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('assets', 'is_under_amc', { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('assets', 'accumulated_depreciation_opening', { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('assets', 'companies_act_accumulated', { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 });

    // AssetAmc — next_service_date
    await addIfMissing('asset_amcs', 'next_service_date', { type: Sequelize.DATEONLY });
    await addIfMissing('asset_amcs', 'status', {
      type: Sequelize.ENUM('ACTIVE', 'EXPIRED', 'PENDING'),
      defaultValue: 'ACTIVE'
    });

    // Vendors — compliance fields added in later migrations
    await addIfMissing('vendors', 'gstin_validated_at', { type: Sequelize.DATE });
    await addIfMissing('vendors', 'gstin_status', { type: Sequelize.STRING(20) });
    await addIfMissing('vendors', 'compliance_score', { type: Sequelize.DECIMAL(5, 2), defaultValue: 100 });
    await addIfMissing('vendors', 'risk_level', { type: Sequelize.STRING(20), defaultValue: 'LOW' });
    await addIfMissing('vendors', 'pan_expiry', { type: Sequelize.DATEONLY });
    await addIfMissing('vendors', 'gst_expiry', { type: Sequelize.DATEONLY });
    await addIfMissing('vendors', 'msme_expiry', { type: Sequelize.DATEONLY });

    // Support tickets — client_id
    await addIfMissing('support_tickets', 'client_id', { type: Sequelize.INTEGER, allowNull: true });

    console.log('✅ Missing asset/vendor columns added');
  },

  async down() {}
};
