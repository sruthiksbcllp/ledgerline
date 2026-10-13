'use strict';
/**
 * CR-DEP-P2b — additive columns on it_act_block_ledger for Section 50 short-term capital
 * gain/loss and block cessation. sale_proceeds already exists (P2a). Idempotent, reversible.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('it_act_block_ledger');
    if (!cols.short_term_capital_gain) {
      await queryInterface.addColumn('it_act_block_ledger', 'short_term_capital_gain', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    }
    if (!cols.short_term_capital_loss) {
      await queryInterface.addColumn('it_act_block_ledger', 'short_term_capital_loss', { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 });
    }
    if (!cols.block_ceased) {
      await queryInterface.addColumn('it_act_block_ledger', 'block_ceased', { type: Sequelize.BOOLEAN, defaultValue: false });
    }
  },
  async down(queryInterface) {
    const cols = await queryInterface.describeTable('it_act_block_ledger');
    if (cols.short_term_capital_gain) await queryInterface.removeColumn('it_act_block_ledger', 'short_term_capital_gain');
    if (cols.short_term_capital_loss) await queryInterface.removeColumn('it_act_block_ledger', 'short_term_capital_loss');
    if (cols.block_ceased) await queryInterface.removeColumn('it_act_block_ledger', 'block_ceased');
  },
};
