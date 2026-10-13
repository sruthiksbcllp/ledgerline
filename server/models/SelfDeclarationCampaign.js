const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class SelfDeclarationCampaign extends Model {
    static associate(models) {
      SelfDeclarationCampaign.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
      SelfDeclarationCampaign.hasMany(models.SelfDeclarationResponse, { foreignKey: 'campaign_id', as: 'responses' });
    }
  }

  SelfDeclarationCampaign.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    campaign_name: { type: DataTypes.STRING, allowNull: false },
    scope_type: {
      type: DataTypes.ENUM('ALL_ASSETS', 'DEPARTMENT', 'LOCATION', 'CUSTODIAN'),
      defaultValue: 'ALL_ASSETS'
    },
    scope_id: DataTypes.INTEGER,
    start_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    due_date: DataTypes.DATE,
    status: {
      type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'CLOSED'),
      defaultValue: 'ACTIVE'
    },
    created_by: DataTypes.INTEGER,
    instructions: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'SelfDeclarationCampaign',
    tableName: 'self_declaration_campaigns',
    freezeTableName: true,
    underscored: true
  });

  return SelfDeclarationCampaign;
};
