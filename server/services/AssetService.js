'use strict';
const { Asset, IdSequence, AssetCodeConfig, Property, Location, Department, AssetCategory, sequelize } = require('../models');
const safeExecute = require('../utils/safeExecutor');
const crypto = require('crypto');

class AssetService {
  normalizeCodeSegment(value) {
    if (!value) return 'GEN';
    return String(value)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || 'GEN';
  }

  async applyDepreciationFields(data, transaction) {
    const { AssetCategory } = require('../models');
    const depreciationEngine = require('../utils/depreciationEngine');
    const category = await AssetCategory.findByPk(data.category_id, { transaction });
    const results = depreciationEngine.calculate(data, category);

    data.useful_life = data.useful_life || results.companies_act.useful_life_years;
    data.residual_value = data.residual_value ?? results.companies_act.residual_value;

    // CR-DEP-P5 (#2): do NOT book a depreciation charge at creation. Accumulated = OPENING balance only
    // (0 for a new asset; the imported opening for a migrated/legacy asset). NBV = capitalised cost - opening.
    // The monthly posting engine builds accumulated forward from here (it maintains this snapshot).
    const _capCost = parseFloat(data.total_cost || data.purchase_cost || 0);
    const _openCo = parseFloat(data.accumulated_depreciation_opening || 0);
    data.companies_act_depreciation = results.companies_act.depreciation;
    data.companies_act_accumulated = _openCo;
    data.companies_act_nbv = Math.max(results.companies_act.residual_value, _capCost - _openCo);
    data.co_act_dep_slm_annual = results.companies_act.slm_annual;
    data.co_act_dep_wdv_annual = results.companies_act.wdv_annual;
    data.co_act_accumulated_dep = _openCo;
    data.co_act_wdv_remaining = data.companies_act_nbv;
    data.co_act_residual_value = results.companies_act.residual_value;
    data.co_act_depreciation_method = results.companies_act.method;
    data.useful_life_years = results.companies_act.useful_life_years;
    data.shift_type = data.shift_type || 'single';

    const _openIt = parseFloat(data.it_act_accumulated_opening || 0);
    data.it_act_depreciation = results.it_act.depreciation;
    data.it_act_accumulated = _openIt;
    data.it_act_wdv = Math.max(0, _capCost - _openIt);
    data.it_act_block_id = data.it_act_block_id || results.it_act.block;
    data.it_act_dep_wdv_rate = results.it_act.rate;
    data.it_act_dep_annual = results.it_act.depreciation;
    data.it_act_accumulated_dep = results.it_act.accumulated;
    data.it_act_wdv_remaining = results.it_act.wdv;
    data.it_act_half_year_rule = results.it_act.half_year_rule_applied;
    data.it_act_fy = results.meta.fy;

    return { category, results };
  }

  async getActiveAssetCodeConfig(clientId, transaction) {
    const cfg = await AssetCodeConfig.findOne({
      where: { client_id: clientId || 1, is_active: true },
      transaction
    });

    if (cfg) return cfg;

    return {
      code_mode: 'AUTO',
      prefix: '{PROPERTY}/{CATEGORY}/{LOCATION}',
      sequence_length: 4,
      allow_manual_override: false
    };
  }

  renderPrefixTemplate(template, context) {
    const safe = (v, fallback = 'GEN') => this.normalizeCodeSegment(v || fallback);
    const map = {
      '{PROPERTY}': safe(context.property),
      '{CATEGORY}': safe(context.category),
      '{LOCATION}': safe(context.location),
      '{DEPARTMENT}': safe(context.department),
      '{CLIENT}': safe(context.client)
    };

    let output = String(template || '{PROPERTY}/{CATEGORY}/{LOCATION}');
    Object.entries(map).forEach(([token, value]) => {
      output = output.replace(new RegExp(token, 'g'), value);
    });

    return output;
  }

  buildSequenceKey(prefix) {
    const normalized = String(prefix || 'GEN').toUpperCase();
    if (normalized.length <= 20) return normalized;
    const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 6).toUpperCase();
    return `${normalized.slice(0, 13)}-${hash}`;
  }

  async generateConfiguredAssetCode(data, transaction) {
    const config = await this.getActiveAssetCodeConfig(data.client_id, transaction);
    const requestedCode = String(data.asset_code || '').trim().toUpperCase();

    if ((config.code_mode === 'ERP' || config.allow_manual_override) && requestedCode && !requestedCode.endsWith('/AUTO')) {
      const exists = await Asset.findOne({ where: { asset_code: requestedCode }, transaction });
      if (exists) throw new Error(`Asset code ${requestedCode} already exists`);
      return requestedCode;
    }

    const [property, category, location, department] = await Promise.all([
      Property.findByPk(data.property_id, { transaction }),
      AssetCategory.findByPk(data.category_id, { transaction }),
      Location.findByPk(data.location_id, { transaction }),
      Department.findByPk(data.department_id, { transaction })
    ]);

    const prefix = this.renderPrefixTemplate(config.prefix, {
      property: property?.property_code || property?.property_name,
      category: category?.code || category?.category_name,
      location: location?.location_code || location?.location_name,
      department: department?.dept_code || department?.dept_name,
      client: data.client_id
    });
    const sequenceKey = this.buildSequenceKey(prefix);

    const padding = Number(config.sequence_length || 4);
    const [sequence] = await IdSequence.findOrCreate({
      where: { prefix: sequenceKey },
      defaults: { prefix: sequenceKey, last_value: 0 },
      transaction
    });
    await sequence.reload({
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const nextValue = Number(sequence.last_value || 0) + 1;
    await sequence.update({ last_value: nextValue }, { transaction });

    return `${prefix}/${String(nextValue).padStart(padding, '0')}`;
  }

  /**
   * Create a new enterprise asset with auto-calculations and validation
   */
  async createAsset(data) {
    const transaction = await sequelize.transaction();
    try {
      if (!data.asset_name) throw new Error('Asset Name is required');
      if (!data.category_id) throw new Error('Category is required');
      if (!data.location_id) throw new Error('Location is required');
      if (!data.purchase_cost) throw new Error('Purchase Cost is required');
      if (!data.purchase_date) data.purchase_date = new Date().toISOString().slice(0, 10);

      const purchaseCost = parseFloat(data.purchase_cost || 0);
      const freight = parseFloat(data.freight_charges || 0);
      const installation = parseFloat(data.installation_charges || 0);
      const onetime = parseFloat(data.onetime_charges || 0);
      data.total_cost = purchaseCost + freight + installation + onetime;

      await this.applyDepreciationFields(data, transaction);

      data.asset_code = await this.generateConfiguredAssetCode(data, transaction);
      if (!data.tag_code) data.tag_code = data.asset_code;

      const asset = await Asset.create(data, { transaction });

      try {
        const QRCode = require('qrcode');
        const qrPayload = String(asset.tag_code || asset.asset_code || asset.id);
        const qrImage = await QRCode.toDataURL(qrPayload);
        await asset.update({ qr_code: qrImage }, { transaction });
      } catch (qrError) {
        console.error('QR Generation failed, skipping...', qrError);
      }

      await transaction.commit();

      await safeExecute(async () => {
        const { pushToQueue } = require('./integrationEngine');
        await pushToQueue('TALLY', 'SYNC_ASSET', asset.toJSON());
        await pushToQueue('SAP', 'SYNC_ASSET', asset.toJSON());
      });

      await safeExecute(async () => {
        const activityLogger = require('./activityLogger');
        await activityLogger.log({
          user_id: data.created_by || 1,
          action: 'CREATED',
          module: 'ASSET',
          record_id: asset.id,
          description: `Asset ${asset.asset_code} created manually or via sync.`,
          new_values: asset.toJSON()
        });
      });

      return asset;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async recalculateForUpdate(existingAsset, incomingData) {
    const transaction = await sequelize.transaction();
    try {
      const merged = {
        ...existingAsset.get({ plain: true }),
        ...incomingData
      };

      const purchaseCost = parseFloat(merged.purchase_cost || 0);
      const freight = parseFloat(merged.freight_charges || 0);
      const installation = parseFloat(merged.installation_charges || 0);
      const onetime = parseFloat(merged.onetime_charges || 0);
      merged.total_cost = purchaseCost + freight + installation + onetime;

      await this.applyDepreciationFields(merged, transaction);
      await transaction.commit();
      return merged;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new AssetService();
