const { Asset, Location, AssetCategory } = require('../models');

/**
 * Generates a professional Asset ID / Code based on organizational hierarchy
 * Format: [PREFIX]/[LOC]/[CAT]/[SEQ]
 */
exports.generateAssetId = async (location_id, category_id) => {
  const location = await Location.findByPk(location_id);
  const category = await AssetCategory.findByPk(category_id);

  const locCode = location ? location.location_code : 'LOC';
  const catCode = category ? category.category_name.substring(0, 3).toUpperCase() : 'AST';

  // SBC Prefix
  const prefix = 'SBC';

  // Get next sequence number
  const count = await Asset.count({
    where: { 
      location_id,
      category_id
    }
  });

  const sequence = (count + 1).toString().padStart(4, '0');

  return `${prefix}/${locCode}/${catCode}/${sequence}`;
};
