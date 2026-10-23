const { 
  AuditSession, AuditAsset, AuditScan, AuditResult, 
  AuditPlanning, Asset, sequelize 
} = require('../models');
const { Op } = require('sequelize');
const AlertService = require('./AlertService');
const activityLogger = require('./activityLogger');

class AuditService {
  /**
   * Plan an audit and pull expected assets
   */
  async planAudit(data, userId) {
    const transaction = await sequelize.transaction();
    try {
      const session = await AuditSession.create({
        ...data,
        status: 'PLANNED',
        created_by: userId
      }, { transaction });

      // Pull expected assets based on type (Including Hierarchical Locations)
      const where = { is_disposed: false };
      if (data.property_id) where.property_id = data.property_id;
      if (data.department_id) where.department_id = data.department_id;
      
      if (data.location_id) {
        // Fetch child locations recursively
        const { Location } = require('../models');
        const getChildIds = async (id) => {
          const children = await Location.findAll({ where: { parent_id: id }, attributes: ['id'], transaction });
          let ids = [id];
          for (const child of children) {
            const nested = await getChildIds(child.id);
            ids = [...ids, ...nested];
          }
          return ids;
        };
        const allLocIds = await getChildIds(data.location_id);
        where.location_id = { [Op.in]: allLocIds };
      }

      const assets = await Asset.findAll({ where, transaction });
      
      const expectedAssets = assets.map(a => ({
        audit_session_id: session.id,
        asset_id: a.id,
        expected_location_id: a.location_id,
        client_id: session.client_id
      }));

      await AuditAsset.bulkCreate(expectedAssets, { transaction });

      await transaction.commit();
      return session;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Start audit execution
   */
  async startAudit(sessionId) {
    const session = await AuditSession.findByPk(sessionId);
    if (!session) throw new Error('Audit session not found');
    await session.update({ 
      status: 'IN_PROGRESS', 
      actual_start_date: new Date() 
    });

    activityLogger.log({
      user_id: session.created_by,
      action: 'STARTED',
      module: 'AUDIT',
      record_id: sessionId,
      description: `Audit session ${session.audit_name} started.`
    });

    return session;
  }

  /**
   * Record a scan during audit with real-time status check
   */
  async recordScan(data, userId) {
    const { audit_session_id, qr_code, rfid_tag, scanned_location_id } = data;
    
    // 0. Check Session Status (Locking)
    const session = await AuditSession.findByPk(audit_session_id);
    if (!session) throw new Error('Audit session not found');
    if (session.status !== 'IN_PROGRESS') {
      throw new Error(`Cannot record scans for an audit in ${session.status} status.`);
    }
    
    // 1. Find asset by code/tag
    const asset = await Asset.findOne({
      where: {
        [Op.or]: [
          { asset_code: qr_code || null },
          { rfid_tag: rfid_tag || null }
        ]
      }
    });

    if (!asset) {
      // Create scan for unknown/invalid tag if needed, but for now we throw
      throw new Error('Asset not found in system');
    }

    // 2. Check if asset is expected in this session
    const expected = await AuditAsset.findOne({
      where: {
        audit_session_id,
        asset_id: asset.id
      }
    });

    let status = 'FOUND';
    if (!expected) {
      status = 'EXTRA';
    } else if (expected.expected_location_id !== parseInt(scanned_location_id)) {
      status = 'MISMATCH';
    }

    const existingScan = await AuditScan.findOne({
      where: { audit_session_id, asset_id: asset.id }
    });

    if (existingScan) {
      return {
        ...existingScan.toJSON(),
        asset_name: asset.asset_name,
        asset_code: asset.asset_code,
        status: 'ALREADY_SCANNED'
      };
    }

    const scan = await AuditScan.create({
      audit_session_id,
      asset_id: asset.id,
      qr_code: asset.asset_code,
      rfid_tag: asset.rfid_tag,
      scanned_location_id,
      scanned_by: userId
    });

    // 3. Return scan with status and updated stats for real-time UI
    const allScans = await AuditScan.findAll({ where: { audit_session_id } });
    const allExpected = await AuditAsset.count({ where: { audit_session_id } });
    
    return {
      ...scan.toJSON(),
      asset_name: asset.asset_name,
      asset_code: asset.asset_code,
      status,
      updated_stats: {
        total: allExpected,
        found: allScans.filter(s => s.status === 'FOUND').length,
        scanned: allScans.length,
        remaining: Math.max(0, allExpected - allScans.length)
      }
    };
  }


  /**
   * Complete audit and run comparison engine
   */
  async completeAudit(sessionId) {
    const transaction = await sequelize.transaction();
    try {
      const session = await AuditSession.findByPk(sessionId, { transaction });
      if (!session) throw new Error('Audit session not found');
      if (session.status !== 'IN_PROGRESS') {
          throw new Error('Only audits IN_PROGRESS can be completed.');
      }

      // 1. Get Expected Assets
      const expected = await AuditAsset.findAll({ 
        where: { audit_session_id: sessionId },
        include: [{ model: Asset, attributes: ['asset_code', 'asset_name'] }],
        transaction 
      });

      // 2. Get Actual Scans (Grouped by Asset)
      const scans = await AuditScan.findAll({ 
        where: { audit_session_id: sessionId },
        include: [{ model: Asset, attributes: ['asset_code', 'asset_name'] }],
        transaction 
      });

      const scannedAssetIds = new Set(scans.filter(s => s.asset_id).map(s => s.asset_id));
      const results = [];

      // Logic A: FOUND, MISSING, MISMATCH
      for (const exp of expected) {
          const matchingScans = scans.filter(s => s.asset_id === exp.asset_id);
          
          if (matchingScans.length > 0) {
              // Check for location mismatch
              const primaryScan = matchingScans[0];
              if (primaryScan.scanned_location_id !== exp.expected_location_id) {
                  results.push({
                      audit_session_id: sessionId,
                      asset_id: exp.asset_id,
                      status: 'MISMATCH',
                      expected_location_id: exp.expected_location_id,
                      actual_location_id: primaryScan.scanned_location_id,
                      remarks: 'Found in incorrect location'
                  });

                  // Trigger HIGH Alert for Wrong Location
                  await AlertService.createAlert({
                      alert_type: 'MOVEMENT',
                      severity: 'HIGH',
                      source_module: 'AUDIT',
                      reference_id: exp.asset_id,
                      title: `Location Mismatch: ${exp.Asset?.asset_code || exp.asset_id}`,
                      description: `Asset ${exp.Asset?.asset_name} found in location ID ${primaryScan.scanned_location_id} but expected in ID ${exp.expected_location_id} during audit ${sessionId}`,
                      status: 'OPEN',
                      created_by: session.created_by
                  });
              } else {
                  results.push({
                      audit_session_id: sessionId,
                      asset_id: exp.asset_id,
                      status: 'FOUND',
                      expected_location_id: exp.expected_location_id,
                      actual_location_id: primaryScan.scanned_location_id
                  });
              }
          } else {
              results.push({
                  audit_session_id: sessionId,
                  asset_id: exp.asset_id,
                  status: 'MISSING',
                  expected_location_id: exp.expected_location_id,
                  remarks: 'Asset not found during verification'
              });

              // Trigger CRITICAL Alert for Missing Asset
              await AlertService.createAlert({
                  alert_type: 'AUDIT',
                  severity: 'CRITICAL',
                  source_module: 'AUDIT',
                  reference_id: exp.asset_id,
                  title: `Asset Missing: ${exp.Asset?.asset_code || exp.asset_id}`,
                  description: `Expected asset ${exp.Asset?.asset_name} not found during audit ${sessionId} at expected location ID ${exp.expected_location_id}`,
                  status: 'OPEN',
                  created_by: session.created_by
              });
          }
      }


      // Logic B: EXTRA (Scanned but not expected)
      const expectedAssetIds = new Set(expected.map(e => e.asset_id));
      const extraScans = scans.filter(s => s.asset_id && !expectedAssetIds.has(s.asset_id));
      
      for (const extra of extraScans) {
          results.push({
              audit_session_id: sessionId,
              asset_id: extra.asset_id,
              status: 'EXTRA',
              actual_location_id: extra.scanned_location_id,
              remarks: 'Asset found but was not expected in this audit scope'
          });

          // Trigger MEDIUM Alert for Unknown/Extra Tag
          await AlertService.createAlert({
              alert_type: 'UNKNOWN_TAG',
              severity: 'MEDIUM',
              source_module: 'AUDIT',
              reference_id: extra.asset_id,
              title: `Unknown Asset Found: ${extra.asset_id}`,
              description: `Unexpected asset found at location ${extra.scanned_location_id} during audit ${sessionId}`,
              status: 'OPEN',
              created_by: session.created_by
          });
      }

      await AuditResult.bulkCreate(results, { transaction });
      await session.update({ 
          status: 'COMPLETED', 
          actual_end_date: new Date() 
      }, { transaction });

      // NEW: Update Asset verification status
      for (const res of results) {
        if (res.status === 'FOUND') {
          await Asset.update({
            verification_status: 'VERIFIED',
            last_verified_date: new Date(),
            asset_status: 'ACTIVE'
          }, { where: { id: res.asset_id }, transaction });
        } else if (res.status === 'MISSING') {
          await Asset.update({
            verification_status: 'NOT_FOUND',
            asset_status: 'MISSING'
          }, { where: { id: res.asset_id }, transaction });
        }
      }

      await transaction.commit();
      return { session, resultCount: results.length };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Schedule an Audit Plan into a Session
   */
  async schedulePlan(planId, auditorId, dates, userId) {
    const transaction = await sequelize.transaction();
    try {
      const plan = await AuditPlanning.findByPk(planId, { transaction });
      if (!plan) throw new Error('Plan not found');

      const session = await AuditSession.create({
        audit_name: plan.audit_name,
        client_id: plan.client_id, // was missing -> session saved as default tenant and vanished from the list
        property_id: plan.property_id,
        location_id: plan.location_id,
        planned_start_date: dates.start_date || plan.start_date,
        planned_end_date: dates.end_date || plan.end_date,
        auditor_id: auditorId,
        plan_id: plan.id,
        status: 'SCHEDULED',
        created_by: userId
      }, { transaction });

      // Handle multi-locations if applicable
      const locationIds = plan.multi_locations || [plan.location_id];
      const assets = await Asset.findAll({ 
        where: { 
          location_id: locationIds,
          is_disposed: false 
        },
        transaction 
      });

      const expectedAssets = assets.map(a => ({
        audit_session_id: session.id,
        asset_id: a.id,
        expected_location_id: a.location_id,
        client_id: session.client_id
      }));

      await AuditAsset.bulkCreate(expectedAssets, { transaction });
      await plan.update({ status: 'SCHEDULED' }, { transaction });

      await transaction.commit();

      activityLogger.log({
        user_id: userId,
        action: 'SCHEDULED',
        module: 'AUDIT',
        record_id: session.id,
        description: `Audit session scheduled for auditor ID ${auditorId}.`
      });

      return session;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Submit Audit for Manager Review
   */
  async submitForReview(sessionId, userId) {
    const session = await AuditSession.findByPk(sessionId);
    if (session.status !== 'COMPLETED' && session.status !== 'REJECTED') {
      throw new Error('Audit must be COMPLETED or REJECTED to submit for review.');
    }
    await session.update({ status: 'REVIEW' });

    activityLogger.log({
      user_id: userId,
      action: 'SUBMITTED',
      module: 'AUDIT',
      record_id: sessionId,
      description: `Audit session ${session.audit_name} submitted for manager review.`
    });

    return session;
  }

  /**
   * Manager Approval: Close the Audit
   */
  async approveAudit(sessionId, userId, remarks) {
    const session = await AuditSession.findByPk(sessionId);
    if (session.status !== 'REVIEW') {
      throw new Error('Only audits in REVIEW can be approved.');
    }
    await session.update({ 
      status: 'CLOSED', 
      reviewer_id: userId,
      approval_remarks: remarks
    });

    activityLogger.log({
      user_id: userId,
      action: 'APPROVED',
      module: 'AUDIT',
      record_id: sessionId,
      description: `Audit session ${session.audit_name} approved and closed.`,
      new_values: { remarks }
    });

    return session;
  }

  /**
   * Manager Rejection: Send back to Auditor
   */
  async rejectAudit(sessionId, userId, remarks) {
    const session = await AuditSession.findByPk(sessionId);
    if (session.status !== 'REVIEW') {
      throw new Error('Only audits in REVIEW can be rejected.');
    }
    await session.update({ 
      status: 'REJECTED', 
      reviewer_id: userId,
      approval_remarks: remarks
    });

    activityLogger.log({
      user_id: userId,
      action: 'REJECTED',
      module: 'AUDIT',
      record_id: sessionId,
      description: `Audit session ${session.audit_name} rejected by manager.`,
      new_values: { remarks }
    });

    return session;
  }
}

module.exports = new AuditService();
