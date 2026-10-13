'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_activitylogs_prevent_update');
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_activitylogs_prevent_delete');

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_activitylogs_prevent_update
      BEFORE UPDATE ON activitylogs
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Activity logs are immutable and cannot be updated';
      END
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_activitylogs_prevent_delete
      BEFORE DELETE ON activitylogs
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Activity logs are immutable and cannot be deleted';
      END
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_activitylogs_prevent_update');
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_activitylogs_prevent_delete');
  }
};
