import api from '../utils/api';

/**
 * Enterprise Dashboard Analytics Service
 * Transforms raw backend metrics into business-ready intelligence.
 */
class DashboardService {
  /**
   * Fetches and prepares dashboard statistics
   */
  async getDashboardIntelligence(qs = '') {
    try {
      const [summaryRes, trendsRes, alertsRes, recommendRes, momRes] = await Promise.allSettled([
        api.get(`/dashboard/summary${qs}`),
        api.get(`/dashboard/trends${qs}`),
        api.get(`/dashboard/alerts${qs}`),
        api.get(`/dashboard/recommendations${qs}`),
        api.get(`/dashboard/month-over-month${qs}`),
      ]);

      const summary = this._extractData(summaryRes, {
        totalAssets: 0,
        totalAssetValue: 0,
        auditReadinessScore: 0,
        verifiedAssets: 0,
        missingAssets: 0,
        missingAssetValue: 0
      });

      const trends = this._extractData(trendsRes, {
        labels: [],
        monthlyAdditions: [],
        monthlyDisposals: [],
        verificationTrend: []
      });

      const alerts = this._extractData(alertsRes, []);
      const recommendations = this._extractData(recommendRes, []);
      const monthOverMonth = this._extractData(momRes, {
        totalAssets:    { change: 0, up: true },
        verifiedAssets: { change: 0, up: true },
        pendingAudit:   { change: 0, up: true },
        criticalIssues: { change: 0, up: true },
      });

      return {
        summary,
        monthOverMonth,
        trends: this._processTrends(trends),
        alerts: this._processAlerts(alerts),
        recommendations: recommendations.length > 0 ? recommendations : this._generateFallbacks(summary)
      };
    } catch (error) {
      // Dashboard intelligence unavailable — callers handle null gracefully
      return null;
    }
  }

  /**
   * Safe data extraction from settled promises.
   *
   * Backend dashboard endpoints respond with { success, data: {...} } (via
   * responseHandler.success). axios puts the body on response.data, so the
   * actual payload lives at result.value.data.data. The previous code returned
   * result.value.data — i.e. the wrapper object — so summary.totalAssets,
   * trends.labels, etc. were all undefined. That's why every KPI rendered as
   * 0 / NaN and the trend chart sat on "Gathering trend data...".
   */
  _extractData(result, fallback) {
    if (result.status !== 'fulfilled') return fallback;
    const res = result.value;
    const body = res?.data;
    if (body && typeof body === 'object' && 'data' in body) {
      return body.data ?? fallback;
    }
    return body ?? fallback;
  }

  /**
   * Transforms trend data for high-fidelity charting
   */
  _processTrends(trends) {
    if (!trends.labels || trends.labels.length === 0) return [];
    
    return trends.labels.map((label, index) => ({
      name: label,
      additions: trends.monthlyAdditions?.[index] || 0,
      disposals: trends.monthlyDisposals?.[index] || 0,
      verifications: trends.verificationTrend?.[index] || 0,
    }));
  }

  /**
   * Categorizes and sorts alerts by risk severity
   */
  _processAlerts(alerts) {
    if (!Array.isArray(alerts)) return [];
    
    const severityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
    
    return alerts.map(alert => ({
      ...alert,
      severity: alert.severity || 'MEDIUM',
      statusColor: this._getSeverityColor(alert.severity),
      category: alert.type?.replace(/_/g, ' ') || 'SYSTEM'
    })).sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  _getSeverityColor(severity) {
    switch (severity) {
      case 'HIGH': return '#EF4444'; // Red-500
      case 'MEDIUM': return '#F59E0B'; // Amber-500
      case 'LOW': return '#10B981'; // Emerald-500
      default: return '#64748B'; // Slate-500
    }
  }

  /**
   * Generates intelligent fallback recommendations based on summary metrics
   */
  _generateFallbacks(summary) {
    const recs = [];
    if (summary.missingAssets > 0) {
      recs.push({ priority: 'HIGH', message: `Identify and reconcile ${summary.missingAssets} missing assets to avoid audit notes.` });
    }
    if (summary.auditReadinessScore < 80) {
      recs.push({ priority: 'MEDIUM', message: 'Initiate a quarterly verification cycle to improve audit readiness score.' });
    }
    if (summary.duplicateAssets > 0) {
      recs.push({ priority: 'LOW', message: 'Data cleansing recommended: Multiple serial number duplicates detected.' });
    }
    return recs;
  }
}

export default new DashboardService();
