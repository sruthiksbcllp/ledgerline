'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('purchase_requisition_items').catch(() => null);
    if (!tableDesc) return;

    if (!tableDesc.requisition_id) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items ADD COLUMN requisition_id INT NULL`
      );
    }

    if (tableDesc.pr_id) {
      await queryInterface.sequelize.query(
        `UPDATE purchase_requisition_items SET requisition_id = pr_id WHERE requisition_id IS NULL AND pr_id IS NOT NULL`
      );
    }

    await queryInterface.sequelize.query(
      `ALTER TABLE purchase_requisition_items MODIFY COLUMN requisition_id INT NOT NULL`
    );

    if (!tableDesc.client_id) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items ADD COLUMN client_id INT NOT NULL DEFAULT 1`
      );
    }

    if (!tableDesc.quantity) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items ADD COLUMN quantity DECIMAL(10,2) NOT NULL DEFAULT 1`
      );
    }

    if (!tableDesc.unit) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items ADD COLUMN unit VARCHAR(255) NULL`
      );
    }

    if (!tableDesc.justification) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items ADD COLUMN justification TEXT NULL`
      );
    }

    if (!tableDesc.item_name) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items ADD COLUMN item_name VARCHAR(255) NULL`
      );
    }

    if (tableDesc.pr_id) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items DROP COLUMN pr_id`
      );
    }

    if (tableDesc.created_at && !tableDesc.createdAt) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items CHANGE created_at createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
      );
    }
    if (tableDesc.updated_at && !tableDesc.updatedAt) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items CHANGE updated_at updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
      );
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('purchase_requisition_items').catch(() => null);
    if (!tableDesc) return;
    if (tableDesc.requisition_id && !tableDesc.pr_id) {
      await queryInterface.sequelize.query(
        `ALTER TABLE purchase_requisition_items CHANGE requisition_id pr_id INT NOT NULL`
      );
    }
  }
};
