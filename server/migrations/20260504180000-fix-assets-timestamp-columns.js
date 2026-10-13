'use strict';

module.exports = {
  up: async (queryInterface) => {
    const hasColumn = async (col) => {
      try {
        const desc = await queryInterface.describeTable('assets');
        return Object.prototype.hasOwnProperty.call(desc, col);
      } catch (_) { return false; }
    };

    if (await hasColumn('createdAt') && !(await hasColumn('created_at'))) {
      await queryInterface.sequelize.query('ALTER TABLE assets CHANGE `createdAt` `created_at` DATETIME NULL');
    } else if (await hasColumn('createdAt') && await hasColumn('created_at')) {
      await queryInterface.sequelize.query('UPDATE assets SET created_at = `createdAt` WHERE created_at IS NULL');
      await queryInterface.sequelize.query('ALTER TABLE assets DROP COLUMN `createdAt`');
    }

    if (await hasColumn('updatedAt') && !(await hasColumn('updated_at'))) {
      await queryInterface.sequelize.query('ALTER TABLE assets CHANGE `updatedAt` `updated_at` DATETIME NULL');
    } else if (await hasColumn('updatedAt') && await hasColumn('updated_at')) {
      await queryInterface.sequelize.query('UPDATE assets SET updated_at = `updatedAt` WHERE updated_at IS NULL');
      await queryInterface.sequelize.query('ALTER TABLE assets DROP COLUMN `updatedAt`');
    }

    if (!(await hasColumn('created_at'))) {
      await queryInterface.sequelize.query('ALTER TABLE assets ADD COLUMN `created_at` DATETIME NULL');
    }
    if (!(await hasColumn('updated_at'))) {
      await queryInterface.sequelize.query('ALTER TABLE assets ADD COLUMN `updated_at` DATETIME NULL');
    }
  },

  down: async (queryInterface) => {
    const hasColumn = async (col) => {
      try {
        const desc = await queryInterface.describeTable('assets');
        return Object.prototype.hasOwnProperty.call(desc, col);
      } catch (_) { return false; }
    };
    if (await hasColumn('created_at')) {
      await queryInterface.sequelize.query('ALTER TABLE assets CHANGE `created_at` `createdAt` DATETIME NULL');
    }
    if (await hasColumn('updated_at')) {
      await queryInterface.sequelize.query('ALTER TABLE assets CHANGE `updated_at` `updatedAt` DATETIME NULL');
    }
  }
};
