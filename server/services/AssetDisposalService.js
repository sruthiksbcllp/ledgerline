const { AssetDisposal, Asset, AssetAccounting, User, sequelize } = require('../models');
const { Op } = require('sequelize');

class AssetDisposalService {
  async requestDisposal(data, userId) {
    return await sequelize.transaction(async (t) => {
      const asset = await Asset.findByPk(data.asset_id, {
        include: [{ model: AssetAccounting }],
        transaction: t
      });

      if (!asset) throw new Error('Asset not found');
      if (asset.asset_status === 'DISPOSED' || asset.is_disposed) throw new Error('Asset already disposed');
      if (Number(data.sale_value) < 0) throw new Error('Sale value cannot be negative');

      // Book value = current Net Book Value (Companies Act). Prefer the stored NBV updated
      // by depreciation posting; else derive cost - accumulated; else fall back to cost.
      const disposalCost = Number(asset.total_cost || asset.purchase_cost || 0);
      const disposalAccum = Number(asset.companies_act_accumulated || 0);
      const book_value = asset.companies_act_nbv != null
        ? Number(asset.companies_act_nbv)
        : Math.max(0, disposalCost - disposalAccum);

      const disposal = await AssetDisposal.create({
        ...data,
        client_id: asset.client_id,
        book_value,
        status: 'REQUESTED',
        created_by: userId
      }, { transaction: t });

      return disposal;
    });
  }

  async approveDisposal(id, userId) {
    const disposal = await AssetDisposal.findByPk(id);
    if (!disposal) throw new Error('Disposal request not found');
    if (disposal.status !== 'REQUESTED') throw new Error('Invalid status for approval');

    await disposal.update({
      status: 'APPROVED',
      approved_by: userId
    });

    return disposal;
  }

  async completeDisposal(id, userId) {
    return await sequelize.transaction(async (t) => {
      const disposal = await AssetDisposal.findByPk(id, { transaction: t });
      if (!disposal) throw new Error('Disposal request not found');
      if (disposal.status !== 'APPROVED') throw new Error('Only approved disposals can be completed');

      const asset = await Asset.findByPk(disposal.asset_id, { transaction: t });
      if (!asset) throw new Error('Asset not found');

      const gain_loss = Number(disposal.sale_value) - Number(disposal.book_value);

      await disposal.update({
        status: 'COMPLETED',
        gain_loss
      }, { transaction: t });

      await asset.update({
        asset_status: 'DISPOSED',
        is_disposed: true,
        is_active: false,
        disposal_date: disposal.disposal_date || new Date(),
        disposal_value: Number(disposal.sale_value || 0)
      }, { transaction: t });

      // GL Integration — post disposal JV (non-blocking, no-op if toggle OFF)
      try {
        const { postDisposal } = require('./glPostingService');
        const accumulatedDep = Number(disposal.book_value) > 0
          ? Number(asset.purchase_cost || asset.total_cost || 0) - Number(disposal.book_value)
          : 0;
        postDisposal({
          clientId: asset.client_id,
          asset,
          accumulatedDep,
          saleValue: Number(disposal.sale_value || 0),
          disposalMethod: disposal.disposal_method || 'WRITE_OFF'
        }).catch(() => {});
      } catch { /* GL posting is non-blocking */ }

      return disposal;
    });
  }

  async getDisposals(filters = {}, clientId = null) {
    const where = {};
    if (filters.status) where.status = filters.status;

    const assetWhere = clientId ? { client_id: clientId } : {};

    return await AssetDisposal.findAll({
      where,
      include: [
        { model: Asset, attributes: ['asset_name', 'asset_code'], where: assetWhere, required: true },
        { model: User, as: 'Requester', attributes: ['username'] },
        { model: User, as: 'Approver', attributes: ['username'] }
      ],
      order: [['createdAt', 'DESC']]
    });
  }

  async deleteDisposal(id, clientId) {
    const disposal = await AssetDisposal.findByPk(id, { include: [{ model: Asset, attributes: ['client_id'] }] });
    if (!disposal) throw new Error('Disposal not found');
    if (clientId && disposal.Asset && disposal.Asset.client_id !== clientId) throw new Error('Disposal not found');
    // A completed/approved disposal already changed the asset — must not be silently deleted.
    if (['APPROVED', 'COMPLETED'].includes(disposal.status)) {
      throw new Error('Cannot delete an approved or completed disposal. Only a pending (Requested) disposal can be cancelled.');
    }
    await disposal.destroy();
    return { id: Number(id) };
  }
}

module.exports = new AssetDisposalService();
