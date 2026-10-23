'use strict';

const dashboardService = require('./dashboard.service');
const gapService = require('./gap.service');

/**
 * Pure function to generate recommendations based on provided data rules
 * @param {Object} data 
 * @returns {Array}
 */
const generateRecommendations = (data) => {
  try {
    const {
      totalAssets = 0,
      verifiedAssets = 0,
      missingAssets = 0,
      missingAssetValue = 0,
      inactiveAssets = 0,
      duplicateAssets = 0
    } = data;

    const verifiedPercentage =
      totalAssets > 0 ? (verifiedAssets / totalAssets) * 100 : 0;

    const recommendations = [];

    // RULE 1: Missing Assets
    if (missingAssets > 0) {
      const valueLakhs = (missingAssetValue / 100000).toFixed(2);
      recommendations.push({
        type: "RISK",
        priority: "HIGH",
        title: "HIGH RISK",
        message: `Investigate ${missingAssets} missing assets (₹${valueLakhs} Lakhs)`,
        action: "Investigate"
      });
    }

    // RULE 3: Low Verification
    if (verifiedPercentage < 80) {
      recommendations.push({
        type: "AUDIT",
        priority: "MEDIUM",
        title: "MEDIUM RISK",
        message: `Verification coverage is low (${verifiedPercentage.toFixed(1)}%)`,
        action: "Schedule Audit"
      });
    }

    // RULE 5: Duplicates
    if (duplicateAssets > 0) {
      recommendations.push({
        type: "DATA",
        priority: "LOW",
        title: "LOW RISK",
        message: "Duplicate asset entries detected.",
        action: "Fix Master"
      });
    }

    return recommendations;
  } catch (err) {
    /* silenced */
    return [];
  }
};

class RecommendationService {
  /**
   * Orchestrate data fetching and recommendation generation
   */
  async getRecommendations() {
    try {
      const summary = await dashboardService.getSummary();
      const gapSummary = await gapService.getSummary();
      const missingByLocation = await gapService.getMissingByLocation();

      // Consolidate data for the recommendation engine
      const dataInput = {
        totalAssets: summary.totalAssets || 0,
        verifiedAssets: summary.verifiedAssets || 0,
        missingAssets: gapSummary.missingAssets || 0,
        missingAssetValue: gapSummary.missingAssetValue || 0,
        inactiveAssets: summary.inactiveAssets || 0,
        duplicateAssets: gapSummary.duplicateAssets || 0
      };

      const baseRecs = generateRecommendations(dataInput);

      // ADD LOCATION SPECIFIC RULE
      if (missingByLocation && missingByLocation.length > 0) {
        const topLoc = missingByLocation[0];
        if (topLoc.missing_count > 5) {
          baseRecs.push({
            type: "LOCATION",
            priority: "HIGH",
            title: "CRITICAL ZONE ALERT",
            message: `High discrepancies detected in ${topLoc.location_name} (${topLoc.missing_count} assets missing).`,
            action: "Audit Zone"
          });
        }
      }

      return baseRecs;
    } catch (error) {
      /* silenced */
      return [];
    }
  }
}

module.exports = {
  getRecommendations: async () => {
    const summary = await dashboardService.getSummary();
    return generateRecommendations(summary);
  },
  generateRecommendations
};
