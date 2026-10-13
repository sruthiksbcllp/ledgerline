'use strict';
const { Asset, AssetMovement, sequelize } = require('../models');

class AssetMovementService {
  /**
   * Create a movement request
   */
  async createMovement(data) {
    const asset = await Asset.findByPk(data.asset_id);
    if (!asset) throw new Error('Asset not found');

    if (asset.location_id === data.to_location_id && asset.department_id === data.to_department_id) {
        throw new Error('Destination is the same as current location/department');
    }

    return await AssetMovement.create({
      ...data,
      client_id: asset.client_id,
      from_location_id: asset.location_id,
      from_department_id: asset.department_id,
      status: 'PENDING'
    });
  }

  /**
   * Approve movement
   */
  async approveMovement(id, userId) {
    const movement = await AssetMovement.findByPk(id);
    if (!movement) throw new Error('Movement request not found');
    if (movement.status !== 'PENDING') throw new Error('Movement is not in PENDING state');

    return await movement.update({
      status: 'APPROVED',
      approved_by: userId,
      approved_at: new Date()
    });
  }

  /**
   * Complete movement and update Asset state
   */
  async completeMovement(id, userId) {
    const transaction = await sequelize.transaction();
    try {
      const movement = await AssetMovement.findByPk(id, { transaction });
      if (!movement) throw new Error('Movement not found');
      if (movement.status !== 'APPROVED' && movement.status !== 'PENDING') {
          throw new Error('Movement cannot be completed in current state');
      }

      const asset = await Asset.findByPk(movement.asset_id, { transaction });
      if (!asset) throw new Error('Asset not found');

      // Update Asset state
      await asset.update({
        location_id: movement.to_location_id || asset.location_id,
        department_id: movement.to_department_id || asset.department_id,
        last_moved_at: new Date(),
        last_movement_id: movement.id
      }, { transaction });

      // Mark movement as completed
      await movement.update({ status: 'COMPLETED', updated_by: userId }, { transaction });

      await transaction.commit();
      return movement;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new AssetMovementService();
