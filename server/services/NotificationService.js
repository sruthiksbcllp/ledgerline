'use strict';
const { AuditNotification, AuditSession } = require('../models');

class NotificationService {
  static async getUnreadNotifications(role) {
    try {
      console.log("SERVICE DEBUG - FETCHING NOTIFICATIONS FOR ROLE:", role);
      const notifications = await AuditNotification.findAll({
        where: { is_read: false, target_role: role },
        include: [{ model: AuditSession, attributes: ['audit_name'] }],
        order: [['created_at', 'DESC']]
      });
      console.log("SERVICE DEBUG - FOUND:", notifications.length);
      return notifications;
    } catch (err) {
      console.error("SERVICE ERROR - getUnreadNotifications:", err);
      throw err;
    }
  }

  static async markAsRead(id) {
    try {
      return await AuditNotification.update({ is_read: true }, { where: { id } });
    } catch (err) {
      console.error("SERVICE ERROR - markAsRead:", err);
      throw err;
    }
  }
}

module.exports = NotificationService;
