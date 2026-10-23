'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE depreciationledgers 
        MODIFY COLUMN book_type ENUM('SLM_COMPANIES_ACT','WDV_IT_ACT','BUDGETARY') NOT NULL
      `);
      console.log('~ depreciationledgers.book_type: BUDGETARY value ensured');
    } catch (e) {
      console.log('book_type already correct or table missing:', e.message);
    }
  },
  async down() {}
};
