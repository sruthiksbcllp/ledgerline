'use strict';
module.exports = (sequelize, DataTypes) => {
  const PoTermsDefault = sequelize.define('PoTermsDefault', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    department_id: { type: DataTypes.INTEGER, allowNull: false },
    warranty: { type: DataTypes.STRING(255), allowNull: true },
    payment_terms: { type: DataTypes.STRING(255), allowNull: true },
    terms_conditions: { type: DataTypes.TEXT, allowNull: true },
  }, { sequelize, modelName: 'PoTermsDefault', tableName: 'po_terms_defaults', freezeTableName: true, timestamps: true });
  return PoTermsDefault;
};
