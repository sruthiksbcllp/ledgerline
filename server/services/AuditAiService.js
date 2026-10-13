'use strict';
const { AuditSession, AuditResult, AuditAiInsight, AuditNotification, AuditRiskScore, Asset, sequelize } = require('../models');
const { Op } = require('sequelize');

class AuditAiService {
  /**
   * Main Core Engine: Generate Audit Insights (Requirement 5)
   */
  static async generateAuditInsights(audit_session_id) {
    const transaction = await sequelize.transaction();
    try {
      const session = await AuditSession.findByPk(audit_session_id, {
        include: ['Location']
      });
      if (!session) throw new Error('Audit session not found');

      // 1. Data Retrieval
      const { AuditScan } = require('../models');
      const scannedCount = await AuditScan.count({ where: { audit_session_id } });
      const expectedCount = session.expected_assets_count || 0;
      const verificationRate = expectedCount > 0 ? (scannedCount / expectedCount) * 100 : 0;
      const missingCount = Math.max(0, expectedCount - scannedCount);
      
      // 2. Compliance Evaluation (CARO 2020)
      const complianceStatus = verificationRate < 70 ? 'NON-COMPLIANT' : (verificationRate < 100 ? 'PARTIALLY COMPLIANT' : 'COMPLIANT');
      
      const complianceFlags = [
        { 
          issue: `Verification Coverage: ${verificationRate.toFixed(1)}%`, 
          status: complianceStatus,
          remark: verificationRate < 70 ? "Fails statutory 'reasonable interval' requirement under CARO 2020." : "Meets internal control standards."
        }
      ];

      // 3. Multi-Dimensional Risk Analysis
      const riskAnalysis = [
        { 
          category: 'Financial Risk', 
          level: missingCount > 0 ? 'HIGH' : 'LOW', 
          description: missingCount > 0 ? `Unverified asset value poses significant balance sheet risk.` : "No immediate financial impact detected."
        },
        { 
          category: 'Operational Risk', 
          level: verificationRate < 50 ? 'HIGH' : (verificationRate < 90 ? 'MEDIUM' : 'LOW'), 
          description: `Asset traceability score at ${verificationRate.toFixed(1)}%.`
        },
        { 
          category: 'Compliance Risk', 
          level: verificationRate < 70 ? 'CRITICAL' : 'STABLE', 
          description: `Alignment with CARO 2020 physical verification standards.`
        }
      ];

      // 4. AI Insights & Recommendations
      const aiInsights = [
        `Audit speed: Verification completed for ${scannedCount} assets.`,
        `Discrepancy trend: ${missingCount} assets were missing from the baseline.`,
        `Location analysis: ${session.Location?.location_name || 'Site'} requires a secondary reconciliation sweep.`
      ];

      const recommendedActions = [
        'Initiate immediate floor-to-book reconciliation for missing items.',
        'Review internal control procedures for asset movement tracking.',
        'Schedule a follow-up audit for high-value missing assets within 30 days.'
      ];

      // 5. Save to audit_ai_insights
      const insight = await AuditAiInsight.create({
        audit_session_id,
        summary: `The audit of ${session.audit_name} resulted in a ${verificationRate.toFixed(1)}% verification rate. Compliance status is currently ${complianceStatus}.`,
        risk_analysis_json: riskAnalysis,
        compliance_flags_json: complianceFlags,
        ai_insights_json: aiInsights,
        recommended_actions_json: recommendedActions,
        is_latest: true
      }, { transaction });

      await transaction.commit();
      return insight;
    } catch (err) {
      if (transaction) await transaction.rollback();
      throw err;
    }
  }

  /**
   * Alert Engine: Insert into audit_notifications
   */
  static async processAuditAlerts(audit_session_id, alerts) {
    for (const alert of alerts) {
      await AuditNotification.create({
        audit_session_id,
        type: alert.type.toUpperCase(),
        message: alert.message,
        target_role: alert.target_role,
        is_read: false
      });
    }
  }

  static async getLatestInsight(sessionId) {
    return await AuditAiInsight.findOne({
      where: { audit_session_id: sessionId, is_latest: true },
      order: [['created_at', 'DESC']]
    });
  }
}

module.exports = AuditAiService;
