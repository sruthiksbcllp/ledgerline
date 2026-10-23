'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Asset extends Model {
    static associate(models) {
      Asset.belongsTo(models.Property, { foreignKey: 'property_id', as: 'property' });
      Asset.belongsTo(models.AssetCategory, { foreignKey: 'category_id', as: 'category' });
      Asset.belongsTo(models.AssetSubCategory, { foreignKey: 'sub_category_id' });
      Asset.belongsTo(models.Department, { foreignKey: 'department_id' });
      Asset.belongsTo(models.SubDepartment, { foreignKey: 'sub_department_id' });
      Asset.belongsTo(models.Region, { foreignKey: 'region_id' });
      Asset.belongsTo(models.Location, { foreignKey: 'location_id', as: 'location' });
      Asset.belongsTo(models.AssetStatus, { foreignKey: 'status_id' });
      Asset.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
      Asset.belongsTo(models.User, { foreignKey: 'updated_by', as: 'Updater' });
      Asset.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      Asset.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      Asset.belongsTo(models.Entity, { foreignKey: 'entity_id', as: 'Entity' });
      Asset.belongsTo(models.Invoice, { foreignKey: 'invoice_id' });
      Asset.belongsTo(models.GRNItem, { foreignKey: 'grn_item_id' });
      Asset.belongsTo(models.DirectProcurement, { foreignKey: 'direct_procurement_id' });
      Asset.belongsTo(models.User, { foreignKey: 'custodian_id', as: 'Custodian' });
      Asset.hasMany(models.AssetIssue, { foreignKey: 'asset_id' });
      Asset.hasOne(models.AssetAccounting, { foreignKey: 'asset_id' });
      Asset.hasMany(models.Warranty, { foreignKey: 'asset_id' });
      Asset.hasMany(models.AssetAmc, { foreignKey: 'asset_id', as: 'amcs' });
      Asset.hasMany(models.AssetHandover, { foreignKey: 'asset_id', as: 'handovers' });
      Asset.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });

      // Component Depreciation — self-referencing associations
      Asset.belongsTo(models.Asset, { foreignKey: 'parent_asset_id', as: 'parentAsset' });
      // Capitalization Framework
      Asset.belongsTo(models.CapexRequestPlan, { foreignKey: 'capex_request_id', as: 'capexRequest' });
      Asset.hasMany(models.Asset, { foreignKey: 'parent_asset_id', as: 'components' });
    }
  }
  Asset.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },
    entity_id: { type: DataTypes.INTEGER, allowNull: true }, // Phase D - buying entity
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    asset_name: { type: DataTypes.STRING, allowNull: false },
    asset_code: { type: DataTypes.STRING, unique: true, allowNull: false },
    asset_description: DataTypes.TEXT,
    asset_type: { type: DataTypes.STRING, defaultValue: 'OWNED' },
    is_under_amc: { type: DataTypes.BOOLEAN, defaultValue: false },
    tag_code: { type: DataTypes.STRING(100), unique: true },

    // Links & Hierarchy
    property_id: DataTypes.INTEGER,
    property_name: DataTypes.STRING,
    category_id: DataTypes.INTEGER,
    sub_category_id: DataTypes.INTEGER,
    department_id: DataTypes.INTEGER,
    sub_department: DataTypes.STRING,
    region_id: DataTypes.INTEGER,
    location_id: DataTypes.INTEGER,
    sub_location: DataTypes.STRING,
    status_id: DataTypes.INTEGER,
    vendor_id: DataTypes.INTEGER,
    vendor_name: DataTypes.STRING,
    request_id: DataTypes.INTEGER,
    cwip_project_id: DataTypes.INTEGER,
    source_type: { type: DataTypes.ENUM('MANUAL', 'REQUEST', 'GRN', 'CWIP'), defaultValue: 'MANUAL' },

    // Dates & Identification
    capitalization_date: DataTypes.DATE,
    purchase_date: DataTypes.DATE,
    put_to_use_date: DataTypes.DATE,
    po_date: DataTypes.DATE,
    make: DataTypes.STRING,
    model: DataTypes.STRING,
    serial_number: DataTypes.STRING,
    po_number: DataTypes.STRING,
    invoice_number: DataTypes.STRING,

    // Financial Standard
    purchase_cost: DataTypes.DECIMAL(15, 2),
    gst_eligible: { type: DataTypes.BOOLEAN, defaultValue: true },
    gst_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    freight_charges: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    installation_charges: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    onetime_charges: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    other_charges: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    total_cost: DataTypes.DECIMAL(15, 2),

    // Depreciation Standard
    useful_life: DataTypes.INTEGER,
    residual_value: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    depreciation_method: { type: DataTypes.STRING, defaultValue: 'SLM' },
    depreciation_upto_date: DataTypes.DATE,
    accumulated_depreciation_opening: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },

    // Companies Act Results
    companies_act_depreciation: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    companies_act_accumulated: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    companies_act_nbv: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    co_act_dep_slm_annual: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    co_act_dep_wdv_annual: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    co_act_accumulated_dep: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    co_act_wdv_remaining: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    co_act_residual_value: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    co_act_depreciation_method: { type: DataTypes.STRING(10), defaultValue: 'SLM' },
    useful_life_years: DataTypes.INTEGER,

    // IT Act Results
    it_act_depreciation: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    it_act_accumulated: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    it_act_wdv: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    it_act_dep_wdv_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    it_act_dep_annual: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    it_act_accumulated_dep: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    it_act_wdv_remaining: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    it_act_half_year_rule: { type: DataTypes.BOOLEAN, defaultValue: false },
    it_act_fy: DataTypes.STRING(10),

    // Audit-Grade Compliance Extensions
    depreciation_source: { type: DataTypes.ENUM('COMPANIES_ACT', 'IT_ACT'), defaultValue: 'COMPANIES_ACT' },
    opening_wdv: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    depreciation_start_date: DataTypes.DATE,
    it_act_block_id: DataTypes.STRING(50),
    schedule_ii_classification: { type: DataTypes.STRING(200) },
    shift_type: { type: DataTypes.STRING(10), defaultValue: 'single' },

    // Budgetary / Planned Asset fields
    is_budgetary: { type: DataTypes.BOOLEAN, defaultValue: false },
    budgetary_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    budgetary_useful_life: { type: DataTypes.INTEGER, allowNull: true },
    budgetary_method: { type: DataTypes.STRING(10), allowNull: true },
    budgetary_residual_value: { type: DataTypes.DECIMAL(15, 2), allowNull: true, defaultValue: 0 },

    // Movement tracking
    last_moved_at: DataTypes.DATE,
    last_movement_id: DataTypes.INTEGER,

    // Metadata
    remarks: DataTypes.TEXT,
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    asset_status: { type: DataTypes.ENUM('ACTIVE', 'DISPOSED', 'MISSING'), defaultValue: 'ACTIVE' },
    verification_status: { type: DataTypes.ENUM('VERIFIED', 'NOT VERIFIED', 'UNVERIFIED', 'MISSING'), defaultValue: 'UNVERIFIED' },
    last_verified_date: DataTypes.DATE,

    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
    created_by: DataTypes.INTEGER,
    updated_by: DataTypes.INTEGER,
    qr_code: DataTypes.TEXT,
    tag_template: DataTypes.JSON,
    tag_meta: DataTypes.JSON,

    // Disposal Engine
    is_disposed: { type: DataTypes.BOOLEAN, defaultValue: false },
    disposal_date: DataTypes.DATE,
    disposal_value: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },

    // Custodian tracking
    custodian_id: DataTypes.INTEGER,
    sub_department_id: DataTypes.INTEGER,

    // Component Depreciation
    parent_asset_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    is_component_parent: { type: DataTypes.BOOLEAN, defaultValue: false },
    component_name: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },

    // Capitalization Framework
    capitalization_type: { type: DataTypes.ENUM("CAPITALIZE", "EXPENSE", "CWIP"), allowNull: true, defaultValue: null },
    capex_request_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    auto_classified: { type: DataTypes.BOOLEAN, defaultValue: false },

  }, {
    sequelize,
    modelName: 'Asset',
    tableName: 'assets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
  });
  return Asset;
};
