'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Tables already created by baseline migration — try/catch to skip if exists
    try {
      await queryInterface.createTable('assetissues', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        asset_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'assets', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        issue_type: { type: Sequelize.STRING(50), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: false },
        priority: {
          type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
          defaultValue: 'MEDIUM'
        },
        status: {
          type: Sequelize.ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'),
          defaultValue: 'OPEN'
        },
        reported_by: {
          type: Sequelize.INTEGER,
          references: { model: 'users', key: 'id' }
        },
        assigned_to: {
          type: Sequelize.INTEGER,
          references: { model: 'users', key: 'id' }
        },
        vendor_id: {
          type: Sequelize.INTEGER,
          references: { model: 'vendors', key: 'id' }
        },
        resolved_at: { type: Sequelize.DATE },
        remarks: { type: Sequelize.TEXT },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    try {
      await queryInterface.createTable('assetissuecomments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        issue_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'assetissues', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' }
        },
        comment: { type: Sequelize.TEXT, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }
  },

  async down (queryInterface) {
    try { await queryInterface.dropTable('assetissuecomments'); } catch(e) { /* skip */ }
    try { await queryInterface.dropTable('assetissues'); } catch(e) { /* skip */ }
  }
};
