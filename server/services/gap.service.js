'use strict';

const { Asset, sequelize } = require('../models');

class GapService {
  _scope(clientId, alias = '') {
    const prefix = alias ? `${alias}.` : '';
    if (clientId === null || clientId === undefined || clientId === '') {
      return { clause: '1=1', replacements: {} };
    }
    return { clause: `${prefix}client_id = :clientId`, replacements: { clientId } };
  }

  /**
   * Get dynamic gap analysis summary
   */
  async getSummary(clientId) {
    try {
      const assetScope = this._scope(clientId);
      const scanScope = this._scope(clientId, 's');

      // 1. Total System Assets
      const [systemStats] = await sequelize.query(`
        SELECT 
          COUNT(*) as systemAssets,
          SUM(COALESCE(total_cost, 0)) as totalValue
        FROM assets WHERE ${assetScope.clause}
      `, { replacements: assetScope.replacements });
      
      const systemAssets = parseInt(systemStats[0].systemAssets) || 0;

      // 2. Physical Assets (Assets verified in the system)
      const [physicalStats] = await sequelize.query(`
        SELECT COUNT(*) as physicalAssets
        FROM assets 
        WHERE verification_status = 'VERIFIED' AND ${assetScope.clause}
      `, { replacements: assetScope.replacements });
      const physicalAssets = parseInt(physicalStats[0].physicalAssets) || 0;

      // 3. Missing Assets (Assets marked as MISSING)
      const [missingStats] = await sequelize.query(`
        SELECT 
          COUNT(*) as missingAssets,
          SUM(COALESCE(total_cost, 0)) as missingValue
        FROM assets 
        WHERE verification_status = 'MISSING' AND ${assetScope.clause}
      `, { replacements: assetScope.replacements });
      const missingAssets = parseInt(missingStats[0].missingAssets) || 0;
      const missingAssetValue = parseFloat(missingStats[0].missingValue) || 0;

      // 4. Extra Assets (Scans that don't match any asset code)
      const [extraStats] = await sequelize.query(`
        SELECT COUNT(DISTINCT s.scanned_code) as extraAssets
        FROM scan_logs s 
        LEFT JOIN assets a ON (s.scanned_code = a.asset_code OR s.scanned_code = a.tag_code) AND ${this._scope(clientId, 'a').clause}
        WHERE ${scanScope.clause} AND a.id IS NULL
      `, { replacements: { ...scanScope.replacements, ...this._scope(clientId, 'a').replacements } });
      const extraAssets = parseInt(extraStats[0].extraAssets) || 0;

      // 5. Duplicate Assets (System Duplicates on asset_code)
      const [duplicateStats] = await sequelize.query(`
        SELECT COUNT(*) as duplicateAssets
        FROM (
          SELECT asset_code
          FROM assets 
          WHERE asset_code IS NOT NULL AND asset_code != '' AND ${assetScope.clause}
          GROUP BY asset_code
          HAVING COUNT(*) > 1
        ) as dup
      `, { replacements: assetScope.replacements });
      const duplicateAssets = parseInt(duplicateStats[0].duplicateAssets) || 0;

      const gapPercentage = systemAssets > 0 ? (missingAssets / systemAssets) * 100 : 0;

      return {
        systemAssets,
        physicalAssets,
        missingAssets,
        extraAssets,
        duplicateAssets,
        missingAssetValue: parseFloat(missingAssetValue.toFixed(2)),
        gapPercentage: parseFloat(gapPercentage.toFixed(2))
      };
    } catch (error) {
      console.error('Gap Summary Logic Error:', error);
      throw error;
    }
  }

  async getMissingList(clientId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const assetScope = this._scope(clientId);
    const [rows] = await sequelize.query(`
      SELECT id, asset_code, asset_name, total_cost, location_id
      FROM assets 
      WHERE verification_status = 'MISSING' AND ${assetScope.clause}
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { ...assetScope.replacements, limit, offset }
    });
    return rows;
  }

  async getExtraList(clientId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const scanScope = this._scope(clientId, 's');
    const assetScope = this._scope(clientId, 'a');
    const [rows] = await sequelize.query(`
      SELECT DISTINCT s.scanned_code as asset_code, s.created_at as scanned_at, s.user_id as scanned_by
      FROM scan_logs s 
      LEFT JOIN assets a ON (s.scanned_code = a.asset_code OR s.scanned_code = a.tag_code) AND ${assetScope.clause}
      WHERE ${scanScope.clause} AND a.id IS NULL
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { ...scanScope.replacements, ...assetScope.replacements, limit, offset }
    });
    return rows;
  }

  async getDuplicateList(clientId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const assetScope = this._scope(clientId);
    const [rows] = await sequelize.query(`
      SELECT asset_code, asset_name, COUNT(*) as occurrence
      FROM assets 
      WHERE ${assetScope.clause}
      GROUP BY asset_code, asset_name
      HAVING COUNT(*) > 1
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { ...assetScope.replacements, limit, offset }
    });
    return rows;
  }

  async getTopMissing(clientId) {
    const assetScope = this._scope(clientId);
    const [rows] = await sequelize.query(`
      SELECT asset_name, total_cost
      FROM assets 
      WHERE verification_status = 'MISSING' AND ${assetScope.clause}
      ORDER BY CAST(total_cost AS DECIMAL(15,2)) DESC
      LIMIT 5
    `, { replacements: assetScope.replacements });
    return rows;
  }

  async getMissingByLocation(clientId) {
    const assetScope = this._scope(clientId, 'a');
    const [rows] = await sequelize.query(`
      SELECT l.location_name, COUNT(a.id) as missing_count
      FROM assets a
      JOIN locations l ON a.location_id = l.id
      WHERE a.verification_status = 'MISSING' AND ${assetScope.clause}
      GROUP BY l.location_name
      ORDER BY missing_count DESC
      LIMIT 3
    `, { replacements: assetScope.replacements });
    return rows;
  }
}

module.exports = new GapService();
