'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DocumentNumberingConfig extends Model {}
  DocumentNumberingConfig.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    document_type: {
      type: DataTypes.ENUM('PR', 'PO', 'GRN', 'QUOTATION', 'RFQ', 'INVOICE', 'SES'),
      allowNull: false
    },
    prefix: { type: DataTypes.STRING(20), allowNull: false },
    separator: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '-' },
    entity_code: { type: DataTypes.STRING(20), allowNull: true },
    include_fy: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    include_location: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // CR-P06
    include_entity: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // the client: dynamic entity short_code segment
    include_department: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // the client: dynamic department code segment
    fy_format: {
      type: DataTypes.ENUM('YYYY', 'YY', 'FYXX', 'FYXXXX'),
      allowNull: false,
      defaultValue: 'YYYY'
    },
    fy_start_month: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    sequence_padding: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    sequence_start: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    reset_sequence: {
      type: DataTypes.ENUM('YEARLY', 'MONTHLY', 'NEVER'),
      allowNull: false,
      defaultValue: 'YEARLY'
    },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, {
    sequelize,
    modelName: 'DocumentNumberingConfig',
    tableName: 'document_numbering_config',
    freezeTableName: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['client_id', 'document_type'], where: { is_active: true } }
    ]
  });
  return DocumentNumberingConfig;
};
