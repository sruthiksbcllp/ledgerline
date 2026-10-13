'use strict';
const { Asset, Warranty, PurchaseRequisition, AssetAlert, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Enterprise Alert Engine
 * Rule-based alert generation and tracking.
 */
class AlertEngine {
  /**
   * Run all alert rules
   */
  async runRules() {
    console.log('[AlertEngine] Running rules...');
    await this.checkWarrantyExpiry();
    await this.checkApprovalDelays();
    // More rules can be added here
  }

  /**
   * Check for warranties expiring in the next 30 days
   */
  async checkWarrantyExpiry() {
    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const expiringWarranties = await Warranty.findAll({
        where: {
          end_date: {
            [Op.between]: [new Date(), thirtyDaysFromNow]
          },
          is_active: true
        },
        include: [{ model: Asset }]
      });

      for (const w of expiringWarranties) {
        await AssetAlert.findOrCreate({
          where: {
            asset_id: w.asset_id,
            alert_type: 'WARRANTY_EXPIRY',
            status: 'OPEN'
          },
          defaults: {
            property_id: w.Asset?.property_id,
            description: `Warranty for ${w.Asset?.asset_name} is expiring on ${w.end_date.toLocaleDateString()}`,
            severity: 'MEDIUM',
            trigger_date: new Date()
          }
        });
      }
      console.log(`[AlertEngine] Warranty check complete. Processed ${expiringWarranties.length} potential alerts.`);
    } catch (error) {
      console.error('[AlertEngine] Warranty check failed:', error);
    }
  }

  /**
   * Check for approvals pending for more than 3 days
   */
  async checkApprovalDelays() {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const delayedApprovals = await PurchaseRequisition.findAll({
        where: {
          status: 'PENDING_APPROVAL',
          updatedAt: { [Op.lt]: threeDaysAgo }
        }
      });

      for (const pr of delayedApprovals) {
        await AssetAlert.findOrCreate({
          where: {
            alert_type: 'APPROVAL_DELAY',
            reference_id: pr.id,
            status: 'OPEN'
          },
          defaults: {
            property_id: pr.property_id,
            description: `PR ${pr.pr_number} has been pending approval for more than 3 days.`,
            severity: 'HIGH',
            trigger_date: new Date()
          }
        });
      }
      console.log(`[AlertEngine] Approval delay check complete. Processed ${delayedApprovals.length} delayed PRs.`);
    } catch (error) {
      console.error('[AlertEngine] Approval delay check failed:', error);
    }
  }
}

module.exports = new AlertEngine();
