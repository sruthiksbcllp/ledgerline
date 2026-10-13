'use strict';
const { ActivityLog } = require('../models');

const normalizeValue = (value) => {
  if (value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

/**
 * Enterprise Activity Logging Service
 * Fully asynchronous, fail-safe, non-blocking.
 */
class ActivityLogger {
  constructor() {
    this.queue = Promise.resolve();
  }

  enqueue(task) {
    this.queue = this.queue
      .then(task)
      .catch((error) => {
        console.error('[ActivityLogger] Failed to write log:', error.message);
      });
    return this.queue;
  }

  /**
   * Log an activity silently without blocking the main thread
   * @param {Object} params Logging parameters
   * @param {number} params.user_id - ID of user performing action
   * @param {string} params.action - e.g. 'CREATED', 'UPDATED', 'DELETED', 'LOGIN'
   * @param {string} params.module - e.g. 'ASSET', 'REQUEST', 'AUTH'
   * @param {number} [params.record_id] - ID of affected record
   * @param {string} [params.description] - Human readable description
   * @param {Object} [params.old_values] - State before action
   * @param {Object} [params.new_values] - State after action
   * @param {string} [params.ip_address] - Request IP
   */
  log(params) {
    // Fire and forget. Wrap in try-catch to ensure it never crashes the system.
    setImmediate(async () => {
      try {
        if (!params.user_id) return; // Silent return if no user contextualized
        await this.enqueue(() => ActivityLog.create({
          user_id: params.user_id,
          action: params.action,
          module: params.module,
          record_id: params.record_id || null,
          description: params.description || '',
          old_values: normalizeValue(params.old_values),
          new_values: normalizeValue(params.new_values),
          metadata: normalizeValue(params.metadata || params.details),
          ip_address: params.ip_address || null,
          client_id: params.client_id || null,
          actor_role: params.actor_role || params.role || null,
          request_method: params.request_method || null,
          request_path: params.request_path || null,
          user_agent: params.user_agent || null
        }));
      } catch (error) {
        // Log to console but NEVER throw to caller
        console.error('[ActivityLogger] Failed to write log:', error.message);
      }
    });
  }

  /**
   * Alias for compatibility with newer requirements
   */
  logActivity({ user_id, module, action, description, details, metadata, client_id, role, actor_role, ip_address, request_method, request_path, user_agent }) {
    this.log({
      user_id,
      module,
      action,
      description,
      metadata: metadata || details,
      client_id,
      role,
      actor_role,
      ip_address,
      request_method,
      request_path,
      user_agent
    });
  }
}

module.exports = new ActivityLogger();
