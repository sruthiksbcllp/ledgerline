const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class SelfDeclarationResponse extends Model {
    static associate(models) {
      SelfDeclarationResponse.belongsTo(models.SelfDeclarationCampaign, { foreignKey: 'campaign_id' });
      SelfDeclarationResponse.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      SelfDeclarationResponse.belongsTo(models.User, { foreignKey: 'custodian_id', as: 'Custodian' });
    }
  }

  SelfDeclarationResponse.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    campaign_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    custodian_id: DataTypes.INTEGER,
    declaration_status: {
      type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'MISMATCH', 'NOT_FOUND', 'DAMAGED'),
      defaultValue: 'PENDING'
    },
    condition_status: {
      type: DataTypes.ENUM('GOOD', 'FAIR', 'POOR', 'DAMAGED', 'NOT_FOUND'),
      defaultValue: 'GOOD'
    },
    current_location: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    declared_at: DataTypes.DATE,
    evidence_json: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'SelfDeclarationResponse',
    tableName: 'self_declaration_responses',
    freezeTableName: true,
    underscored: true
  });

  return SelfDeclarationResponse;
};
