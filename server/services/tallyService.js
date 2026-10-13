'use strict';
const axios = require('axios');

class TallyService {
  /**
   * Generates Tally XML Payload
   */
  generateTallyXML(data, action) {
    let messageBody = '';

    if (action === 'SYNC_ASSET') {
      messageBody = `
        <TALLYMESSAGE>
          <LEDGER NAME="${data.asset_code} - ${data.asset_name}">
            <NAME>${data.asset_code} - ${data.asset_name}</NAME>
            <PARENT>Fixed Assets</PARENT>
            <OPENINGBALANCE>${data.total_cost || data.purchase_cost || 0}</OPENINGBALANCE>
          </LEDGER>
        </TALLYMESSAGE>
      `;
    } else if (action === 'POST_DEPRECIATION_JV') {
      const entries = (data.entries || []);
      let ledgerEntries = '';
      for (const e of entries) {
        const amount = e.debit > 0 ? -e.debit : e.credit;
        ledgerEntries += `
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>${e.ledger}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${e.debit > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
                <AMOUNT>${amount}</AMOUNT>
              </ALLLEDGERENTRIES.LIST>`;
      }
      messageBody = `
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Journal" ACTION="Create">
            <DATE>${(data.journal_date || new Date().toISOString().split('T')[0]).replace(/-/g, '')}</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <NARRATION>${data.narration || 'Depreciation JV'}</NARRATION>${ledgerEntries}
          </VOUCHER>
        </TALLYMESSAGE>
      `;

    } else if (action === 'POST_ACQUISITION_JV') {
      const entries = (data.entries || []);
      let ledgerEntries = '';
      for (const e of entries) {
        const amount = e.debit > 0 ? -e.debit : e.credit;
        ledgerEntries += `
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>${e.ledger}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${e.debit > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
                <AMOUNT>${amount}</AMOUNT>
              </ALLLEDGERENTRIES.LIST>`;
      }
      messageBody = `
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Journal" ACTION="Create">
            <DATE>${(data.journal_date || new Date().toISOString().split('T')[0]).replace(/-/g, '')}</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <NARRATION>${data.narration || 'Asset Acquisition JV'}</NARRATION>${ledgerEntries}
          </VOUCHER>
        </TALLYMESSAGE>
      `;

    } else if (action === 'POST_DISPOSAL_JV' || action === 'POST_TRANSFER_JV') {
      const entries = (data.entries || []);
      let ledgerEntries = '';
      for (const e of entries) {
        const amount = e.debit > 0 ? -e.debit : e.credit;
        ledgerEntries += `
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>${e.ledger}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${e.debit > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
                <AMOUNT>${amount}</AMOUNT>
              </ALLLEDGERENTRIES.LIST>`;
      }
      messageBody = `
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Journal" ACTION="Create">
            <DATE>${(data.journal_date || new Date().toISOString().split('T')[0]).replace(/-/g, '')}</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <NARRATION>${data.narration || 'Asset JV'}</NARRATION>${ledgerEntries}
          </VOUCHER>
        </TALLYMESSAGE>
      `;

    } else if (action === 'POST_INVOICE' || action === 'POST_VOUCHER') {
      messageBody = `
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>${new Date(data.date || new Date()).toISOString().split('T')[0].replace(/-/g, '')}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${data.vendor_name || 'Vendor'}</PARTYLEDGERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${data.vendor_name || 'Vendor'}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${data.total_amount || 0}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Purchases</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${data.total_amount || 0}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      `;
    }

    return `
      <ENVELOPE>
        <HEADER>
          <TALLYREQUEST>Import Data</TALLYREQUEST>
        </HEADER>
        <BODY>
          <IMPORTDATA>
            <REQUESTDESC>
              <REPORTNAME>All Masters</REPORTNAME>
            </REQUESTDESC>
            <REQUESTDATA>
              ${messageBody}
            </REQUESTDATA>
          </IMPORTDATA>
        </BODY>
      </ENVELOPE>
    `;
  }

  /**
   * Post XML to Tally ERP
   */
  async sendToTally(config, xmlPayload) {
    try {
      const tallyUrl = config.base_url || 'http://localhost:9000';
      const response = await axios.post(tallyUrl, xmlPayload, {
        headers: { 'Content-Type': 'application/xml' },
        timeout: 10000
      });
      return { success: true, data: response.data };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new TallyService();
