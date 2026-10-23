'use strict';
const { Model } = require('sequelize');

/** An uploaded file kept in the database (STORAGE_DRIVER=db); see utils/fileStore.js. */
module.exports = (sequelize, DataTypes) => {
  class StoredFile extends Model {}
  StoredFile.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // Path under UPLOAD_DIR, e.g. "invoices/123-bill.pdf" (also the /uploads URL path).
    storage_key: { type: DataTypes.STRING(500), allowNull: false, unique: true },
    content: { type: DataTypes.BLOB('long'), allowNull: false },
    mime_type: { type: DataTypes.STRING(150), allowNull: true },
    size: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    sequelize,
    modelName: 'StoredFile',
    tableName: 'stored_files',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return StoredFile;
};
