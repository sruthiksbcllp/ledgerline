'use strict';

const { Vendor } = require('../models');

class VendorInsightsService {
  async generateInsights(clientId) {
    const where = clientId ? { client_id: clientId } : {};
    const vendors = await Vendor.findAll({ where });

    if (!vendors.length) {
      return { suggestions: [], narrative: 'No vendor data available to analyze.', score: 100, summary: { total: 0, high: 0, medium: 0, low: 0 } };
    }

    const total = vendors.length;
    const high = [], medium = [], low = [];
    const expiredGST = [], expiringSoonGST = [], invalidGSTIN = [], tdsNonFilers = [], noScore = [];

    for (const v of vendors) {
      const score = Number(v.compliance_score ?? 100);
      const band = v.compliance_risk_band || 'BLUE';
      if (score < 50 || band === 'RED') high.push(v);
      else if (score <= 80 || band === 'ORANGE') medium.push(v);
      else low.push(v);
      if (v.gstin_status === 'INVALID_FORMAT') invalidGSTIN.push(v);
      if (v.gstin_status === 'CANCELLED' || v.gstin_status === 'SUSPENDED') expiredGST.push(v);
      const gstDays = v.gst_expiry_date ? Math.ceil((new Date(v.gst_expiry_date) - Date.now()) / 86400000) : null;
      if (gstDays !== null && gstDays >= 0 && gstDays <= 30) expiringSoonGST.push(v);
      if (v.pan_number && v.tds_section_code === '206AB') tdsNonFilers.push(v);
      if (!v.compliance_last_checked) noScore.push(v);
    }

    const suggestions = [];

    if (high.length > 0) suggestions.push({ severity: 'CRITICAL', title: `${high.length} High-Risk Vendor${high.length > 1 ? 's' : ''} Require Immediate Action`, description: `${high.map(v => v.vendor_name).slice(0, 3).join(', ')}${high.length > 3 ? ` and ${high.length - 3} more` : ''} have compliance scores below 50. Consider suspending new POs until resolved.`, action: 'Review & Suspend POs' });
    if (invalidGSTIN.length > 0) suggestions.push({ severity: 'HIGH', title: `${invalidGSTIN.length} Vendor${invalidGSTIN.length > 1 ? 's' : ''} Have Invalid GSTIN Format`, description: `${invalidGSTIN.map(v => v.vendor_name).slice(0, 3).join(', ')} — ITC claims on these invoices may be rejected by the GST portal.`, action: 'Verify & Update GSTIN' });
    if (expiredGST.length > 0) suggestions.push({ severity: 'HIGH', title: `${expiredGST.length} Vendor${expiredGST.length > 1 ? 's' : ''} Have Cancelled/Suspended GST`, description: `${expiredGST.map(v => v.vendor_name).slice(0, 3).join(', ')} — Transacting risks ITC reversal under Section 16(2) of CGST Act.`, action: 'Block Payments' });
    if (expiringSoonGST.length > 0) suggestions.push({ severity: 'MEDIUM', title: `${expiringSoonGST.length} Vendor${expiringSoonGST.length > 1 ? 's' : ''} GST Expiring Within 30 Days`, description: `${expiringSoonGST.map(v => v.vendor_name).slice(0, 3).join(', ')} — Request updated GST certificates proactively.`, action: 'Request Certificates' });
    if (tdsNonFilers.length > 0) suggestions.push({ severity: 'MEDIUM', title: `${tdsNonFilers.length} Vendor${tdsNonFilers.length > 1 ? 's' : ''} Flagged as TDS Non-Filers (206AB)`, description: `${tdsNonFilers.map(v => v.vendor_name).slice(0, 3).join(', ')} — Apply higher TDS rate: twice the standard rate or 5%, whichever is higher.`, action: 'Update TDS Rate' });
    if (noScore.length > 0) suggestions.push({ severity: 'LOW', title: `${noScore.length} Vendor${noScore.length > 1 ? 's' : ''} Have Never Been Compliance-Checked`, description: `${noScore.map(v => v.vendor_name).slice(0, 3).join(', ')} — Run compliance checks to get accurate risk scores.`, action: 'Run Compliance Check' });
    if (medium.length > 0 && high.length === 0) suggestions.push({ severity: 'LOW', title: `${medium.length} Vendor${medium.length > 1 ? 's' : ''} in Medium-Risk Band`, description: `Schedule a quarterly compliance review to prevent escalation to high risk.`, action: 'Schedule Review' });
    if (suggestions.length === 0) suggestions.push({ severity: 'LOW', title: 'Vendor Compliance is Healthy', description: `All ${total} vendors are in the low-risk band with scores above 80. Continue periodic reviews.`, action: null });

    const avgScore = vendors.reduce((sum, v) => sum + Number(v.compliance_score ?? 100), 0) / total;
    const healthScore = Math.round(avgScore);
    const healthLabel = healthScore >= 85 ? 'strong' : healthScore >= 65 ? 'moderate' : 'poor';
    const riskPct = total > 0 ? Math.round(((high.length + medium.length) / total) * 100) : 0;

    let narrative = `Your vendor portfolio of ${total} vendors shows ${healthLabel} overall compliance health with an average score of ${healthScore}/100. `;
    if (high.length > 0) narrative += `${high.length} vendor${high.length > 1 ? 's are' : ' is'} high-risk and require immediate attention — pause new POs until resolved. `;
    if (medium.length > 0) narrative += `${medium.length} vendor${medium.length > 1 ? 's fall' : ' falls'} in medium-risk and should be reviewed within 30 days. `;
    if (invalidGSTIN.length + expiredGST.length > 0) { const g = invalidGSTIN.length + expiredGST.length; narrative += `${g} vendor${g > 1 ? 's have' : ' has'} GSTIN issues — transacting risks ITC disallowance under CGST Act. `; }
    if (tdsNonFilers.length > 0) narrative += `${tdsNonFilers.length} vendor${tdsNonFilers.length > 1 ? 's are' : ' is'} TDS non-filers under Section 206AB, requiring higher TDS deduction. `;
    if (expiringSoonGST.length > 0) narrative += `${expiringSoonGST.length} certificate${expiringSoonGST.length > 1 ? 's are' : ' is'} expiring within 30 days — request renewals proactively. `;
    if (high.length === 0 && medium.length === 0) narrative += `All vendors are low-risk. Continue monthly compliance sweeps to maintain this standing. `;
    narrative += `Overall ${riskPct}% of your vendor base carries some compliance risk. ${riskPct > 30 ? 'A vendor compliance program with quarterly reviews is strongly recommended.' : riskPct > 10 ? 'Targeted remediation for flagged vendors will bring your portfolio to full compliance.' : 'Your compliance controls are working well — maintain current review cadence.'}`;

    return { suggestions, narrative, score: healthScore, summary: { total, high: high.length, medium: medium.length, low: low.length } };
  }
}

module.exports = new VendorInsightsService();
