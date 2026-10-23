const {
  Asset, AssetCodeConfig, sequelize
} = require('../models');
const { getNextCode } = require('../utils/sequence');
const { getStatusId, STATUS } = require('./statusResolver');

/**
 * Get active asset code configuration
 */
const getActiveConfig = async (client_id = 1) => {
  return await AssetCodeConfig.findOne({
    where: { client_id, is_active: true }
  });
};

/**
 * Generate asset code based on strategy
 */
const generateAssetCode = async (config, reqCode, transaction) => {
  if (!config || !config.code_mode) {
    throw new Error('Asset code configuration missing');
  }

  const cleanedCode = reqCode?.trim()?.toUpperCase();

  // ERP Mode
  if (config.code_mode === 'ERP') {
    if (!cleanedCode) throw new Error('Asset Code (ERP) is required');

    const exists = await Asset.findOne({
      where: { asset_code: cleanedCode },
      transaction
    });

    if (exists) throw new Error(`Asset Code ${cleanedCode} already exists`);

    return cleanedCode;
  }

  // AUTO / CUSTOM Mode
  if (config.code_mode === 'AUTO' || config.code_mode === 'CUSTOM') {
    if (config.allow_manual_override && cleanedCode) {
      const exists = await Asset.findOne({
        where: { asset_code: cleanedCode },
        transaction
      });

      if (exists) throw new Error(`Manual Asset Code ${cleanedCode} already exists`);

      return cleanedCode;
    }

    const prefix = config.prefix || 'AST';
    const padding = config.sequence_length || 4;

    return await getNextCode(prefix, padding);
  }

  throw new Error('Invalid Asset Code Configuration');
};

/**
 * SINGLE ASSET CREATION SERVICE
 * Consolidates logic for GRN and Direct Inward flows
 */
const createAssetService = async (assetData, transaction) => {
  // 1. Fetch Config
  const config = await getActiveConfig(assetData.client_id || 1);

  // 2. Generate/Validate Asset Code
  const asset_code = await generateAssetCode(config, assetData.asset_code, transaction);

  // 3. Complete Data with Defaults
  const finalData = {
    ...assetData,
    asset_code,
    asset_name: assetData.asset_name?.trim(),
    status_id: assetData.status_id || await getStatusId(STATUS.ACTIVE),
    is_active: true
  };

  // 4. Create Record
  return await Asset.create(finalData, { transaction });
};

module.exports = {
  createAssetService,
  getActiveConfig,
  generateAssetCode
};
