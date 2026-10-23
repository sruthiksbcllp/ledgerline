'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Client extends Model {
    static associate(models) {
      Client.hasMany(models.ClientLicense, { foreignKey: 'client_id', as: 'licenses' });
      Client.hasMany(models.SupportTicket, { foreignKey: 'client_id', as: 'tickets' });
    }
  }
  Client.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_name: { type: DataTypes.STRING, allowNull: false },
    contact_person: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING, validate: { isEmail: true } },
    phone: { type: DataTypes.STRING },
    company_type: { type: DataTypes.STRING },
    subdomain: { type: DataTypes.STRING(63), allowNull: true, unique: true },
    // Company email domain; self-registered users with this domain join this client.
    email_domain: { type: DataTypes.STRING(255), allowNull: true, unique: true },
    entity_id: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'Client',
    tableName: 'clients',
    freezeTableName: true,
    timestamps: false,
    underscored: true
  });
  return Client;
};
