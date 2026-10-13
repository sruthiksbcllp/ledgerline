/**
 * Asset Normalization Mapper
 * Resolves inconsistencies in asset object structures across different modules.
 */
export const mapAsset = (asset) => ({
  ...asset,
  
  category_name: 
    asset.category_name || 
    asset.category?.category_name || 
    asset.AssetCategory?.category_name || 
    "",

  location_name: 
    asset.location_name || 
    asset.location?.location_name || 
    asset.location?.name || 
    asset.Location?.location_name || 
    "",

  department_name: 
    asset.department_name || 
    asset.department?.dept_name || 
    asset.department?.name || 
    asset.Department?.dept_name || 
    "",

  amc_status: asset.amc_status || 'NONE'
});
