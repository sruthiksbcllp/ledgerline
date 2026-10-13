'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Extend approval_logs to support all modules + role tracking
    const logCols = await queryInterface.describeTable('approval_logs');

    if (!logCols.role_code) {
      await queryInterface.addColumn('approval_logs', 'role_code', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    if (!logCols.status) {
      await queryInterface.addColumn('approval_logs', 'status', {
        type: Sequelize.ENUM('APPROVED', 'REJECTED', 'SUBMITTED', 'ESCALATED'),
        defaultValue: 'SUBMITTED'
      });
    }

    // Change module ENUM to STRING to support all future modules
    await queryInterface.changeColumn('approval_logs', 'module', {
      type: Sequelize.STRING,
      allowNull: false
    });

    // 2. Extend approval_matrix for role_code + is_active
    const matrixCols = await queryInterface.describeTable('approval_matrix');
    if (!matrixCols.role_code) {
      await queryInterface.addColumn('approval_matrix', 'role_code', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    if (!matrixCols.is_active) {
      await queryInterface.addColumn('approval_matrix', 'is_active', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      });
    }
    if (!matrixCols.module_name) {
      await queryInterface.addColumn('approval_matrix', 'module_name', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    // 3. Extend PurchaseRequisitions for full approval tracking
    const prCols = await queryInterface.describeTable('purchaserequisitions');
    if (!prCols.current_approval_level) {
      await queryInterface.addColumn('purchaserequisitions', 'current_approval_level', {
        type: Sequelize.INTEGER, defaultValue: 0
      });
    }
    if (!prCols.total_approval_levels) {
      await queryInterface.addColumn('purchaserequisitions', 'total_approval_levels', {
        type: Sequelize.INTEGER, defaultValue: 0
      });
    }
    if (!prCols.is_fully_approved) {
      await queryInterface.addColumn('purchaserequisitions', 'is_fully_approved', {
        type: Sequelize.BOOLEAN, defaultValue: false
      });
    }

    // 4. Extend PurchaseOrders for approval tracking
    const poCols = await queryInterface.describeTable('purchaseorders');
    if (!poCols.current_approval_level) {
      await queryInterface.addColumn('purchaseorders', 'current_approval_level', {
        type: Sequelize.INTEGER, defaultValue: 0
      });
    }
    if (!poCols.total_approval_levels) {
      await queryInterface.addColumn('purchaseorders', 'total_approval_levels', {
        type: Sequelize.INTEGER, defaultValue: 0
      });
    }
    if (!poCols.is_fully_approved) {
      await queryInterface.addColumn('purchaseorders', 'is_fully_approved', {
        type: Sequelize.BOOLEAN, defaultValue: false
      });
    }

    // 5. Create AssetDisposals approval columns if table exists
    try {
      const disposalCols = await queryInterface.describeTable('assetdisposals');
      if (!disposalCols.current_approval_level) {
        await queryInterface.addColumn('assetdisposals', 'current_approval_level', {
          type: Sequelize.INTEGER, defaultValue: 0
        });
        await queryInterface.addColumn('assetdisposals', 'total_approval_levels', {
          type: Sequelize.INTEGER, defaultValue: 0
        });
        await queryInterface.addColumn('assetdisposals', 'is_fully_approved', {
          type: Sequelize.BOOLEAN, defaultValue: false
        });
        await queryInterface.addColumn('assetdisposals', 'workflow_id', {
          type: Sequelize.INTEGER, allowNull: true
        });
        await queryInterface.addColumn('assetdisposals', 'current_level', {
          type: Sequelize.INTEGER, defaultValue: 0
        });
      }
    } catch (e) {
      console.log('AssetDisposals table not found, skipping.');
    }
  },

  async down(queryInterface, Sequelize) {
    // Revert logic omitted for safety
  }
};
