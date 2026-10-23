'use strict';

/** Remembers which permissions the provider granted (e.g. Mail.Read for reading vendor replies). */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('user_mail_accounts');
    if (!cols.oauth_scopes) await queryInterface.addColumn('user_mail_accounts', 'oauth_scopes', { type: Sequelize.TEXT, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('user_mail_accounts', 'oauth_scopes');
  }
};
