'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS assetphotos (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        asset_id      INT NOT NULL,
        context       ENUM('INWARD','AUDIT','ISSUE','DISPOSAL','GENERAL') NOT NULL DEFAULT 'GENERAL',
        photo_url     VARCHAR(500) NOT NULL,
        filename      VARCHAR(255) NOT NULL,
        caption       VARCHAR(255) NULL,
        latitude      DECIMAL(10,7) NULL,
        longitude     DECIMAL(10,7) NULL,
        uploaded_by   INT NULL,
        client_id     INT NOT NULL,
        created_at    DATETIME DEFAULT NOW(),
        INDEX idx_asset_photos_asset_id (asset_id),
        INDEX idx_asset_photos_client_id (client_id),
        INDEX idx_asset_photos_context (context)
      )
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS assetphotos');
  }
};
