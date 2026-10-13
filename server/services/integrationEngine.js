'use strict';
const { IntegrationQueue, IntegrationLog, IntegrationConfig } = require('../models');
const { Op } = require('sequelize');

const MAX_RETRIES = 3;

/**
 * Push an event to the ERP queue.
 * Controllers should call THIS function instead of direct API calls.
 */
exports.pushToQueue = async (erpType, action, payload, opts = {}) => {
  try {
    const queueItem = await IntegrationQueue.create({
      erp_type: erpType,
      action: action,
      payload: payload,
      status: 'PENDING',
      dedupe_key: opts.dedupe_key != null ? opts.dedupe_key : null
    });
    return queueItem;
  } catch (error) {
    console.error('[IntegrationEngine] Error pushing to queue:', error.message);
    throw error;
  }
};

/**
 * Background worker process that checks the queue
 */
exports.processQueue = async () => {
  console.log('[IntegrationWorker] Checking queue...');
  try {
    // 1. Fetch pending or due-for-retry tasks
    const tasks = await IntegrationQueue.findAll({
      where: {
        status: { [Op.in]: ['PENDING', 'FAILED'] },
        [Op.or]: [
          { next_retry_at: null },
          { next_retry_at: { [Op.lte]: new Date() } }
        ],
        retry_count: { [Op.lt]: MAX_RETRIES }
      },
      limit: 10
    });

    if (!tasks || tasks.length === 0) return;

    for (const task of tasks) {
      // Mark as processing
      await task.update({ status: 'PROCESSING' });

      // Fetch active config for this ERP
      const config = await IntegrationConfig.findOne({
        where: { erp_type: task.erp_type, is_active: true }
      });

      if (!config) {
        await handleFailure(task, 'ERP Integration is not active or configured');
        continue;
      }

      // Execute Transform & API Call
      try {
        let responseData = { success: true };
        let requestData = task.payload;

        if (config.erp_type === 'TALLY') {
          const tallyService = require('./tallyService');
          const xml = tallyService.generateTallyXML(task.payload, task.action);
          requestData = xml; // Log XML
          const apiRes = await tallyService.sendToTally(config, xml);
          responseData = apiRes.data;
        } else if (config.erp_type === 'SAP') {
          const sapService = require('./sapService');
          const jsonPayload = sapService.transformPayload(task.payload, task.action);
          requestData = jsonPayload;
          const apiRes = await sapService.sendToSap(config, jsonPayload, task.action);
          responseData = apiRes.data;
        } else {
          // generic fallback or custom API
          requestData = transformPayload(task.action, task.payload);
          const apiRes = await executeApiCall(config, task.action, requestData);
          responseData = apiRes.data;
        }

        // Success
        await task.update({ status: 'COMPLETED' });
        await IntegrationLog.create({
          queue_id: task.id,
          status: 'SUCCESS',
          request_payload: requestData,
          response_payload: responseData,
          message: 'Synced successfully'
        });

      } catch (err) {
        // Handle Failure
        await handleFailure(task, err.message);
      }
    }
  } catch (err) {
    console.error('[IntegrationWorker] Global processing error:', err.message);
  }
};

async function handleFailure(task, errorMessage) {
  const newRetryCount = task.retry_count + 1;
  const nextRetryAt = new Date();
  nextRetryAt.setMinutes(nextRetryAt.getMinutes() + 5 * newRetryCount); // Exponential backoff
  
  const status = newRetryCount >= MAX_RETRIES ? 'FAILED' : 'PENDING';
  
  await task.update({
    status: status,
    retry_count: newRetryCount,
    next_retry_at: nextRetryAt,
    error_message: errorMessage
  });

  await IntegrationLog.create({
    queue_id: task.id,
    status: 'ERROR',
    request_payload: task.payload,
    response_payload: null,
    message: errorMessage
  });
}

function transformPayload(action, payload) {
  // Add API transformation layer here
  switch(action) {
    case 'POST_PO':
      return { Vendor: payload.vendor_id, Amount: payload.amount, ...payload };
    case 'SYNC_ASSET':
      return { AssetID: payload.asset_code, Value: payload.purchase_cost };
    default:
      return payload;
  }
}

async function executeApiCall(config, action, payload) {
  // Simulate API Call - in real system, use axios with config.base_url
  console.log(`[IntegrationEngine] Calling ${config.erp_type} API for action ${action}`);
  
  if(!config.base_url) throw new Error('Base URL is missing');
  
  // Dummy network simulation
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Randomly fail 10% of the time to demonstrate resilience
      if (Math.random() < 0.1) reject(new Error('Network Timeout'));
      resolve({ data: { success: true, remote_id: Math.floor(Math.random() * 10000) } });
    }, 500);
  });
}
