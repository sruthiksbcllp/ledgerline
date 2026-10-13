const { AssetIssue, AssetIssueComment, Asset, User, Vendor, AssetAlert, sequelize } = require('../models');
const { Op } = require('sequelize');

class AssetIssueService {

  async createIssue(data, userId) {
    return await sequelize.transaction(async (t) => {
      const asset = await Asset.findByPk(data.asset_id, { transaction: t });
      if (!asset) throw new Error('Asset not found');

      let vendor_id = null;
      let status = 'OPEN';

      if (asset.is_under_amc && asset.vendor_id) {
        vendor_id = asset.vendor_id;
        status = 'IN_PROGRESS';
      }

      const issue = await AssetIssue.create({
        ...data,
        reported_by: userId,
        vendor_id,
        status,
        client_id: data.client_id || asset.client_id
      }, { transaction: t });

      if (data.priority === 'CRITICAL') {
        await AssetAlert.create({
          asset_id: asset.id,
          alert_type: 'CRITICAL_ISSUE',
          severity: 'HIGH',
          message: `CRITICAL ISSUE: ${data.issue_type} reported for ${asset.asset_code}`,
          status: 'OPEN'
        }, { transaction: t });
      }

      return issue;
    });
  }

  async getIssues(filters = {}) {
    const where = {};
    if (filters.client_id) where.client_id = filters.client_id;
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.asset_id) where.asset_id = filters.asset_id;
    if (filters.search) {
      where[Op.or] = [
        { issue_type: { [Op.like]: `%${filters.search}%` } },
        { description: { [Op.like]: `%${filters.search}%` } }
      ];
    }

    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 50;
    const offset = (page - 1) * pageSize;

    const { count, rows } = await AssetIssue.findAndCountAll({
      where,
      include: [
        { model: Asset, as: 'Asset', attributes: ['asset_name', 'asset_code', 'asset_type', 'asset_status'] },
        { model: User, as: 'Reporter', attributes: ['first_name', 'last_name', 'username'] },
        { model: User, as: 'AssignedUser', attributes: ['first_name', 'last_name', 'username'] },
        { model: Vendor, as: 'AssignedVendor', attributes: ['vendor_name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset
    });

    return { rows, count, page, pageSize, totalPages: Math.ceil(count / pageSize) };
  }

  async getIssueById(id, client_id) {
    const where = { id };
    if (client_id) where.client_id = client_id;
    return await AssetIssue.findOne({
      where,
      include: [
        { model: Asset, as: 'Asset', attributes: ['asset_name', 'asset_code', 'asset_type', 'asset_status'] },
        { model: User, as: 'Reporter', attributes: ['first_name', 'last_name', 'username'] },
        { model: User, as: 'AssignedUser', attributes: ['first_name', 'last_name', 'username'] },
        { model: Vendor, as: 'AssignedVendor', attributes: ['vendor_name'] },
        {
          model: AssetIssueComment,
          as: 'Comments',
          include: [{ model: User, as: 'Author', attributes: ['first_name', 'last_name', 'username'] }],
          order: [['createdAt', 'ASC']]
        }
      ]
    });
  }

  async updateIssue(id, data, userId) {
    const issue = await AssetIssue.findByPk(id);
    if (!issue) throw new Error('Issue not found');

    const updateData = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.assigned_to_type !== undefined) updateData.assigned_to_type = data.assigned_to_type;
    if (data.assigned_to_vendor !== undefined) updateData.vendor_id = data.assigned_to_vendor;
    if (data.assigned_to !== undefined) updateData.assigned_to = data.assigned_to;
    if (data.remarks !== undefined) updateData.remarks = data.remarks;

    if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
      updateData.resolved_at = new Date();
    }

    await issue.update(updateData);

    if (data.remarks) {
      await AssetIssueComment.create({
        issue_id: id,
        user_id: userId,
        client_id: issue.client_id,
        comment: `Update: ${data.remarks}`
      });
    }

    return issue;
  }

  async updateStatus(id, status, remarks, userId) {
    const issue = await AssetIssue.findByPk(id);
    if (!issue) throw new Error('Issue not found');

    const updateData = { status };
    if (remarks) updateData.remarks = remarks;
    if (status === 'RESOLVED' || status === 'CLOSED') {
      updateData.resolved_at = new Date();
    }

    await issue.update(updateData);

    await AssetIssueComment.create({
      issue_id: id,
      user_id: userId,
      client_id: issue.client_id,
      comment: `Status changed to ${status}${remarks ? '. Remarks: ' + remarks : ''}`
    });

    return issue;
  }

  async assignIssue(id, assigneeId, userId) {
    const issue = await AssetIssue.findByPk(id);
    if (!issue) throw new Error('Issue not found');

    await issue.update({ assigned_to: assigneeId, status: 'IN_PROGRESS' });

    await AssetIssueComment.create({
      issue_id: id,
      user_id: userId,
      client_id: issue.client_id,
      comment: `Issue assigned to user ID: ${assigneeId}`
    });

    return issue;
  }
}

module.exports = new AssetIssueService();
