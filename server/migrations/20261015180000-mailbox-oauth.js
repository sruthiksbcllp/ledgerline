'use strict';

/**
 * One-click mailbox connection: admins can connect Google (Gmail API) or Microsoft
 * (Graph) with OAuth instead of entering SMTP settings. Tokens are encrypted at rest
 * with MAIL_CREDENTIALS_KEY like SMTP passwords. SMTP fields become optional.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('user_mail_accounts');
    if (!cols.provider) {
      await queryInterface.addColumn('user_mail_accounts', 'provider', {
        type: Sequelize.ENUM('SMTP', 'GOOGLE', 'MICROSOFT'), allowNull: false, defaultValue: 'SMTP'
      });
    }
    if (!cols.oauth_refresh_enc) await queryInterface.addColumn('user_mail_accounts', 'oauth_refresh_enc', { type: Sequelize.TEXT, allowNull: true });
    if (!cols.oauth_access_enc) await queryInterface.addColumn('user_mail_accounts', 'oauth_access_enc', { type: Sequelize.TEXT, allowNull: true });
    if (!cols.oauth_expires_at) await queryInterface.addColumn('user_mail_accounts', 'oauth_expires_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.changeColumn('user_mail_accounts', 'smtp_host', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.changeColumn('user_mail_accounts', 'smtp_port', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.changeColumn('user_mail_accounts', 'smtp_user', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.changeColumn('user_mail_accounts', 'password_enc', { type: Sequelize.TEXT, allowNull: true });
  },

  async down(queryInterface) {
    // OAuth-connected rows have no SMTP settings, so remove them before restoring NOT NULL.
    await queryInterface.sequelize.query("DELETE FROM user_mail_accounts WHERE provider <> 'SMTP'");
    for (const col of ['oauth_expires_at', 'oauth_access_enc', 'oauth_refresh_enc', 'provider']) {
      await queryInterface.removeColumn('user_mail_accounts', col);
    }
  }
};
