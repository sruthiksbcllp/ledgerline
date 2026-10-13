'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableExists = await queryInterface.describeTable('document_numbering_config').catch(() => null);
    if (tableExists) return;

    await queryInterface.createTable('document_numbering_config', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      document_type: {
        type: Sequelize.ENUM('PR', 'PO', 'GRN', 'QUOTATION', 'RFQ', 'INVOICE'),
        allowNull: false
      },
      prefix: { type: Sequelize.STRING(20), allowNull: false },
      separator: { type: Sequelize.STRING(5), allowNull: false, defaultValue: '-' },
      entity_code: { type: Sequelize.STRING(20), allowNull: true },
      include_fy: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      fy_format: {
        type: Sequelize.ENUM('YYYY', 'YY', 'FYXX', 'FYXXXX'),
        allowNull: false,
        defaultValue: 'YYYY'
      },
      fy_start_month: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      sequence_padding: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 4 },
      sequence_start: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      reset_sequence: {
        type: Sequelize.ENUM('YEARLY', 'MONTHLY', 'NEVER'),
        allowNull: false,
        defaultValue: 'YEARLY'
      },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await queryInterface.addIndex('document_numbering_config', {
      fields: ['client_id', 'document_type'],
      unique: true,
      where: { is_active: true },
      name: 'uq_client_doctype_active'
    }).catch(() => {
      // MySQL doesn't support partial unique indexes — use a regular unique index
      return queryInterface.addIndex('document_numbering_config', {
        fields: ['client_id', 'document_type'],
        unique: true,
        name: 'uq_client_doctype'
      });
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('document_numbering_config');
  }
};
