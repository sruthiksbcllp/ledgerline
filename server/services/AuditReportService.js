'use strict';
const { 
  AuditSession, AuditResult, Asset, Location, Property, 
  Department, AssetCategory, AuditAiInsight, AuditRiskScore, User 
} = require('../models');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');

class AuditReportService {
  _tenantWhere(clientId) {
    return (clientId === null || clientId === undefined) ? {} : { client_id: clientId };
  }
  /**
   * Backward Compatibility Alias
   */
  async getReportData(sessionId, clientId) {
    return this.getEnterpriseReportData(sessionId, clientId);
  }

  /**
   * Aggregate complete data for the Enterprise Audit Report
   */
  async getEnterpriseReportData(sessionId, clientId) {
    const tenantWhere = this._tenantWhere(clientId);
    const session = await AuditSession.findOne({
      where: { id: sessionId, ...tenantWhere },
      include: [
        { model: Property, attributes: ['property_name'] },
        { model: Location, attributes: ['location_name'] },
        { model: User, as: 'Creator', attributes: ['first_name', 'last_name', 'username'] },
        { model: User, as: 'Reviewer', attributes: ['first_name', 'last_name', 'username'] },
        { model: User, as: 'Auditor', attributes: ['first_name', 'last_name', 'username'] }
      ]
    });

    if (!session) throw new Error('Audit session not found or access denied');

    // 1. Fetch Expected Assets (Including Hierarchical Locations)
    const getChildIds = async (id) => {
      const children = await Location.findAll({ 
        where: { parent_id: id, ...tenantWhere }, 
        attributes: ['id'] 
      });
      let ids = [id];
      for (const child of children) {
        const nested = await getChildIds(child.id);
        ids = [...ids, ...nested];
      }
      return ids;
    };
    const allLocIds = await getChildIds(session.location_id);

    const expectedAssets = await Asset.findAll({
      // Exclude DISPOSED assets — a disposed asset is no longer owned and must not appear as
      // an audit target / MISSING. Re-evaluated at report time so it applies to existing sessions too.
      where: { location_id: { [Op.in]: allLocIds }, is_disposed: false, ...tenantWhere },
      include: [{ model: AssetCategory, as: 'category', attributes: ['category_name'] }]
    });

    // 2. Fetch Actual Scans
    const { AuditScan } = require('../models');
    const scans = await AuditScan.findAll({
      where: { audit_session_id: sessionId, ...tenantWhere },
      include: [{ model: Location, as: 'ScannedLocation', attributes: ['location_name'] }]
    });
    const scannedIds = scans.map(s => s.asset_id);

    // 3. Dynamic Reconciliation (Requirement 2 & 3: FOUND, MISSING, MISMATCH)
    const results = expectedAssets.map(asset => {
      const scan = scans.find(s => s.asset_id === asset.id);
      
      let status = 'MISSING';
      let remarks = 'Not found during physical verification';
      let actualLoc = null;

      if (scan) {
        if (scan.scanned_location_id === asset.location_id) {
          status = 'FOUND';
          remarks = 'Verified in correct location';
        } else {
          status = 'MISMATCH';
          remarks = `Found in ${scan.ScannedLocation?.location_name || 'other location'} instead of registered location`;
        }
        actualLoc = scan.ScannedLocation;
      }

      return {
        Asset: asset,
        status,
        ExpectedLocation: session.Location, // Simplification: using session root location as expected
        ActualLocation: actualLoc,
        remarks
      };
    });

    // 4. Add Extra Assets (Scanned but not in this location)
    const extraScans = scans.filter(s => !expectedAssets.find(a => a.id === s.asset_id));
    if (extraScans.length > 0) {
      const extraAssets = await Asset.findAll({
        where: { id: extraScans.map(s => s.asset_id), ...tenantWhere },
        include: [{ model: AssetCategory, as: 'category', attributes: ['category_name'] }]
      });
      extraAssets.forEach(asset => {
        results.push({
          Asset: asset,
          status: 'EXTRA',
          ExpectedLocation: { location_name: 'Unknown/Other' },
          ActualLocation: session.Location,
          remarks: 'Asset found but not in current location register'
        });
      });
    }

    // NOTE: audit_ai_insights / audit_risk_scores have NO client_id column — they are
    // tenant-scoped through their parent audit session (already verified above). Applying
    // a client_id filter here caused "Unknown column 'AuditAiInsight.client_id'".
    const aiInsight = await AuditAiInsight.findOne({
      where: { audit_session_id: sessionId },
      order: [['created_at', 'DESC']]
    });

    const riskScores = await AuditRiskScore.findAll({
      where: { audit_session_id: sessionId }
    });

    return { session, results, aiInsight, riskScores };
  }

  /**
   * Export to Enterprise PDF (Client-Ready)
   */
  async exportToPDF(sessionId, clientId) {
    const { session, results, aiInsight, riskScores } = await this.getEnterpriseReportData(sessionId, clientId);
    const stats = this.getStats(results);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // --- Header ---
    doc.rect(0, 0, 600, 100).fill('#0B1F3A');
    doc.fillColor('#FFFFFF').fontSize(24).text('STATUTORY AUDIT REPORT', 50, 40);
    doc.fontSize(10).text(`VERSION: ${session.status === 'CLOSED' ? 'FINAL' : 'DRAFT'} | SESSION ID: ${session.id}`, 50, 70);
    doc.moveDown(4);

    // --- Section 1: Executive Summary ---
    doc.fillColor('#0B1F3A').fontSize(16).text('1. EXECUTIVE SUMMARY', { underline: true });
    doc.moveDown(0.5);
    doc.fillColor('#333333').fontSize(11);
    doc.text(`Audit Name: ${session.audit_name}`);
    doc.text(`Property: ${session.Property?.property_name || 'N/A'}`);
    doc.text(`Location Scope: ${session.Location?.location_name || 'All'}`);
    doc.text(`Auditor: ${session.Auditor?.first_name || session.Creator?.first_name} ${session.Auditor?.last_name || session.Creator?.last_name}`);
    doc.text(`Audit Date: ${new Date(session.actual_end_date || session.updatedAt).toLocaleDateString()}`);
    doc.moveDown();

    // --- Section 2: Verification Summary ---
    doc.fillColor('#0B1F3A').fontSize(16).text('2. VERIFICATION SUMMARY');
    doc.moveDown(0.5);
    doc.fillColor('#333333').fontSize(11);
    
    // Stats Grid
    const startX = 50;
    const startY = doc.y;
    this._drawStatBox(doc, startX, startY, 'EXPECTED', stats.total, '#475569');
    this._drawStatBox(doc, startX + 130, startY, 'VERIFIED', stats.found, '#10B981');
    this._drawStatBox(doc, startX + 260, startY, 'MISSING', stats.missing, '#EF4444');
    this._drawStatBox(doc, startX + 390, startY, 'ACCURACY', `${stats.complianceRate}%`, '#3B82F6');
    doc.moveDown(5);

    // --- Section 3: Compliance & CARO 2020 ---
    doc.fillColor('#0B1F3A').fontSize(16).text('3. STATUTORY COMPLIANCE (CARO 2020)');
    doc.moveDown(0.5);
    if (aiInsight && aiInsight.compliance_flags_json) {
      aiInsight.compliance_flags_json.forEach(flag => {
        doc.fillColor('#EF4444').fontSize(10).text(`• [${flag.standard}] ${flag.issue}`);
      });
    } else {
      doc.fillColor('#333333').fontSize(10).text('No statutory violations identified based on current verification coverage.');
    }
    doc.moveDown();

    // --- Section 4: Risk Analysis ---
    doc.fillColor('#0B1F3A').fontSize(16).text('4. RISK ANALYSIS');
    doc.moveDown(0.5);
    riskScores.forEach(risk => {
      doc.fillColor('#333333').fontSize(11).text(`${risk.risk_type.toUpperCase()}: `, { continued: true });
      doc.fillColor(risk.severity === 'high' ? '#EF4444' : '#F59E0B').text(`${risk.severity.toUpperCase()} (Score: ${risk.score})`);
    });
    doc.moveDown();

    // --- Section 5: Recommendations ---
    doc.fillColor('#0B1F3A').fontSize(16).text('5. AI RECOMMENDATIONS');
    doc.moveDown(0.5);
    if (aiInsight && aiInsight.recommended_actions_json) {
      aiInsight.recommended_actions_json.forEach(action => {
        doc.fillColor('#333333').fontSize(10).text(`• ${action}`);
      });
    }
    doc.moveDown(2);

    // --- Footer: Signatures ---
    const footerY = 700;
    doc.lineCap('butt').moveTo(50, footerY).lineTo(200, footerY).stroke();
    doc.lineCap('butt').moveTo(350, footerY).lineTo(500, footerY).stroke();
    
    doc.fontSize(9).text('Auditor Signature', 50, footerY + 5);
    doc.text('Reviewer / Manager Approval', 350, footerY + 5);
    
    if (session.Reviewer) {
      doc.fontSize(8).text(`Approved by: ${session.Reviewer.first_name} ${session.Reviewer.last_name}`, 350, footerY + 20);
      doc.text(`Remarks: ${session.approval_remarks || 'N/A'}`, 350, footerY + 32);
    }

    doc.end();
    return doc;
  }

  _drawStatBox(doc, x, y, label, value, color) {
    doc.rect(x, y, 120, 60).fill('#F8FAFC');
    doc.fillColor(color).fontSize(14).text(value.toString(), x, y + 15, { width: 120, align: 'center' });
    doc.fillColor('#64748B').fontSize(8).text(label, x, y + 40, { width: 120, align: 'center' });
  }

  /**
   * Export to Detailed Excel (Findings)
   */
  async exportToExcel(sessionId, clientId) {
    const { session, results, aiInsight } = await this.getEnterpriseReportData(sessionId, clientId);
    const workbook = new ExcelJS.Workbook();
    
    const sheet = workbook.addWorksheet('Detailed Findings');
    
    // Styling
    sheet.getRow(1).values = ['Enterprise Audit Detailed Asset Findings'];
    sheet.mergeCells('A1:G1');
    sheet.getRow(1).font = { size: 16, bold: true };
    
    sheet.getRow(2).values = [`Audit: ${session.audit_name}`, `Date: ${new Date().toLocaleDateString()}`, `Status: ${session.status}`];

    sheet.columns = [
      { header: 'Asset Code', key: 'code', width: 20 },
      { header: 'Asset Name', key: 'name', width: 35 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Cost', key: 'cost', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Expected Location', key: 'expected', width: 25 },
      { header: 'Actual Location', key: 'actual', width: 25 },
      { header: 'Discrepancy Details', key: 'remarks', width: 40 }
    ];

    results.forEach(res => {
      sheet.addRow({
        code: res.Asset?.asset_code,
        name: res.Asset?.asset_name,
        category: res.Asset?.category?.category_name,
        cost: res.Asset?.purchase_cost,
        status: res.status,
        expected: res.ExpectedLocation?.location_name || 'N/A',
        actual: res.ActualLocation?.location_name || 'N/A',
        remarks: res.remarks
      });
    });

    // Formatting
    sheet.getRow(4).font = { bold: true };
    sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    return workbook;
  }

  getStats(results) {
      const expected = results.filter(r => r.status !== 'EXTRA').length;
      const scanned = results.filter(r => r.status === 'FOUND' || r.status === 'MISMATCH').length;
      const found = results.filter(r => r.status === 'FOUND').length;
      const missing = results.filter(r => r.status === 'MISSING').length;
      const mismatch = results.filter(r => r.status === 'MISMATCH').length;
      const extra = results.filter(r => r.status === 'EXTRA').length;
      
      const missingValue = results
        .filter(r => r.status === 'MISSING')
        .reduce((sum, r) => sum + Number(r.Asset?.total_cost || r.Asset?.purchase_cost || 0), 0);

      const foundValue = results
        .filter(r => r.status === 'FOUND' || r.status === 'MISMATCH')
        .reduce((sum, r) => sum + Number(r.Asset?.total_cost || r.Asset?.purchase_cost || 0), 0);

      return {
          total: expected, 
          total_assets: expected,
          expected_assets: expected,
          scanned_assets: scanned,
          assets_found: scanned, 
          assets_not_found: Math.max(0, expected - scanned),
          found, missing, mismatch, extra,
          missing_value: missingValue,
          found_value: foundValue,
          verification_rate: expected > 0 ? ((scanned / expected) * 100).toFixed(2) : 0,
          complianceRate: expected > 0 ? ((found / expected) * 100).toFixed(2) : 0
      };
  }
}

module.exports = new AuditReportService();
