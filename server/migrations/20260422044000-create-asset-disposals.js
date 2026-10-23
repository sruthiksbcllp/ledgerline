'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('assetdisposals', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { 
        type: Sequelize.INTEGER, 
        allowNull: false, 
        references: { model: 'assets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      disposal_type: { 
        type: Sequelize.ENUM('SALE', 'SCRAP', 'DONATION', 'THEFT', 'DESTRUCTION'), 
        allowNull: false 
      },
      disposal_date: { type: Sequelize.DATE, allowNull: false },
      book_value: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      sale_value: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      gain_loss: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      status: { 
        type: Sequelize.ENUM('REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'), 
        defaultValue: 'REQUESTED' 
      },
      approved_by: { 
        type: Sequelize.INTEGER, 
        references: { model: 'users', key: 'id' } 
      },
      remarks: { type: Sequelize.TEXT },
      created_by: { 
        type: Sequelize.INTEGER, 
        references: { model: 'users', key: 'id' } 
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('assetdisposals');
  }
};
