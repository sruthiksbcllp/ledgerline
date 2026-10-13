'use strict';
const axios = require('axios');

class SapService {
  /**
   * Transforms SBC FIX-TAG payload into SAP OData JSON Format
   */
  transformPayload(data, action) {
    if (action === 'SYNC_ASSET' || action === 'CAPITALIZE_ASSET') {
      return {
        assetName: data.asset_name || 'New Asset',
        value: data.total_cost || data.purchase_cost || data.amount || 0,
        location: data.location_id ? `Loc-${data.location_id}` : 'Default',
        sourceId: data.asset_code || data.id,
        status: 'Active'
      };
    } else if (action === 'POST_PR') {
      return {
        prNumber: data.pr_number,
        department: data.department_id,
        totalEstimatedValue: data.estimated_cost || 0,
        status: 'Created',
        items: data.items || []
      };
    } else if (action === 'POST_PO') {
      return {
        poNumber: data.po_number,
        vendor: data.vendor_id,
        totalValue: data.total_value || 0,
        status: 'Released',
        items: data.items || []
      };
    }
    return data;
  }

  /**
   * Post JSON Payload to SAP OData API
   */
  async sendToSap(config, payload, action) {
    try {
      const baseUrl = config.base_url || 'https://api.sap.com/odata/v2';
      const apiKey = config.auth_token || ''; // Stored securely
      
      let endpoint = '';
      if (action === 'SYNC_ASSET' || action === 'CAPITALIZE_ASSET') {
        endpoint = '/assets';
      } else if (action === 'POST_PR') {
        endpoint = '/procurement/pr';
      } else if (action === 'POST_PO') {
        endpoint = '/procurement/po';
      } else {
        endpoint = '/custom';
      }

      const response = await axios.post(`${baseUrl}${endpoint}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 15000 // 15s timeout
      });

      return { success: true, data: response.data };
    } catch (error) {
      console.error('[SapService] Error sending to SAP:', error.message);
      throw error;
    }
  }
}

module.exports = new SapService();
