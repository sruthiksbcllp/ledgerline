const { 
  AssetCategory, AssetSubCategory, AssetType, AssetStatus, 
  Vendor, Property, Location, Department, MaintenanceType, Unit 
} = require('../models');

class MasterService {
  async getAssetCategories(query = {}) {
    return await AssetCategory.findAll({ where: query });
  }

  async getAssetSubCategories(query = {}) {
    return await AssetSubCategory.findAll({ 
      where: query,
      include: [{ model: AssetCategory, attributes: ['category_name'] }]
    });
  }

  async getAssetTypes(query = {}) {
    return await AssetType.findAll({ where: query });
  }

  async getAssetStatuses(query = {}) {
    return await AssetStatus.findAll({ where: query });
  }

  async getVendors(query = {}) {
    return await Vendor.findAll({ where: query });
  }

  async getProperties(query = {}) {
    return await Property.findAll({ where: query });
  }

  async getLocations(query = {}) {
    return await Location.findAll({ where: query });
  }

  async getDepartments(query = {}) {
    return await Department.findAll({ where: query });
  }

  async getMaintenanceTypes(query = {}) {
    return await MaintenanceType.findAll({ where: query });
  }

  async getUnits(query = {}) {
    return await Unit.findAll({ where: query });
  }
}

module.exports = new MasterService();
