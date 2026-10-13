'use strict';
const { Alert, AlertAction, sequelize } = require('../models');

class AlertService {
  /**
   * Create a new system alert
   */
  async createAlert(data) {
    return await Alert.create(data);
  }

  /**
   * Assign alert to a user
   */
  async assignAlert(alertId, userId, performedBy) {
    const transaction = await sequelize.transaction();
    try {
      const alert = await Alert.findByPk(alertId, { transaction });
      if (!alert) throw new Error('Alert not found');

      await alert.update({ assigned_to: userId, status: 'IN_PROGRESS' }, { transaction });
      
      await AlertAction.create({
        alert_id: alertId,
        action_type: 'ASSIGNED',
        performed_by: performedBy,
        comments: `Alert assigned to user ID: ${userId}`
      }, { transaction });

      await transaction.commit();
      return alert;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Update alert status
   */
  async updateStatus(alertId, status, performedBy, comments = '') {
    const transaction = await sequelize.transaction();
    try {
      const alert = await Alert.findByPk(alertId, { transaction });
      if (!alert) throw new Error('Alert not found');

      const oldStatus = alert.status;
      await alert.update({ 
        status, 
        resolved_at: status === 'RESOLVED' ? new Date() : alert.resolved_at 
      }, { transaction });

      await AlertAction.create({
        alert_id: alertId,
        action_type: 'STATUS_CHANGE',
        performed_by: performedBy,
        comments: `Status changed from ${oldStatus} to ${status}. ${comments}`
      }, { transaction });

      await transaction.commit();
      return alert;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Add a comment to an alert
   */
  async addComment(alertId, performedBy, comments) {
    return await AlertAction.create({
      alert_id: alertId,
      action_type: 'COMMENTED',
      performed_by: performedBy,
      comments
    });
  }
}

module.exports = new AlertService();
