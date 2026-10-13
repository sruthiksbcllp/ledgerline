'use strict';
/**
 * Employee master (net-new) — non-login employee records (Emp Code, RM, Sub-LoB/LoB/SBU, Location).
 * Distinct from `users` (login accounts). Additive + idempotent + reversible.
 * Also adds nullable assets.custodian_emp_id (employee custodian) — NOT wired yet; keeps custodian_id (login user) intact.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const norm = tables.map(t => (typeof t === 'string' ? t : t.tableName).toLowerCase());
    if (!norm.includes('employees')) {
      await queryInterface.createTable('employees', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        emp_code: { type: Sequelize.STRING(50), allowNull: false },
        name: { type: Sequelize.STRING(200), allowNull: false },
        doj: { type: Sequelize.DATEONLY, allowNull: true },
        designation: { type: Sequelize.STRING(150), allowNull: true },
        location: { type: Sequelize.STRING(150), allowNull: true },
        gender: { type: Sequelize.STRING(20), allowNull: true },
        rm_emp_code: { type: Sequelize.STRING(50), allowNull: true },
        rm_name: { type: Sequelize.STRING(200), allowNull: true },
        employment_type: { type: Sequelize.STRING(50), allowNull: true },
        company: { type: Sequelize.STRING(150), allowNull: true },
        sub_lob: { type: Sequelize.STRING(150), allowNull: true },
        lob: { type: Sequelize.STRING(150), allowNull: true },
        sbu: { type: Sequelize.STRING(150), allowNull: true },
        user_id: { type: Sequelize.INTEGER, allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    // unique (client_id, emp_code)
    const idx = await queryInterface.showIndex('employees').catch(() => []);
    if (!idx.some(i => i.name === 'uk_employees_client_emp')) {
      await queryInterface.addIndex('employees', ['client_id', 'emp_code'], { unique: true, name: 'uk_employees_client_emp' });
    }
    if (!idx.some(i => i.name === 'ix_employees_client')) {
      await queryInterface.addIndex('employees', ['client_id'], { name: 'ix_employees_client' }).catch(() => {});
    }
    // additive nullable custodian_emp_id on assets (not wired yet)
    const assetCols = await queryInterface.describeTable('assets').catch(() => ({}));
    if (assetCols && !assetCols.custodian_emp_id) {
      await queryInterface.addColumn('assets', 'custodian_emp_id', { type: Sequelize.INTEGER, allowNull: true });
    }
  },
  async down(queryInterface) {
    const assetCols = await queryInterface.describeTable('assets').catch(() => ({}));
    if (assetCols && assetCols.custodian_emp_id) {
      await queryInterface.removeColumn('assets', 'custodian_emp_id').catch(() => {});
    }
    await queryInterface.dropTable('employees').catch(() => {});
  }
};
