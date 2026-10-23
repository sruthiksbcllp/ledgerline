'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const addIfMissing = async (col, def) => {
      try {
        const desc = await queryInterface.describeTable('assets');
        if (!desc[col]) await queryInterface.addColumn('assets', col, def);
      } catch (_) {}
    };

    await addIfMissing('qr_code',                 { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('tag_template',             { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('tag_meta',                 { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('disposal_date',            { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('disposal_type',            { type: Sequelize.STRING(50), allowNull: true });
    await addIfMissing('custodian_name',           { type: Sequelize.STRING(200), allowNull: true });
    await addIfMissing('custodian_assigned_date',  { type: Sequelize.DATEONLY, allowNull: true });
    await addIfMissing('asset_image',              { type: Sequelize.STRING(500), allowNull: true });
    await addIfMissing('asset_document',           { type: Sequelize.STRING(500), allowNull: true });
  },
  down: async () => {}
};
