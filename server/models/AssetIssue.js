const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class AssetIssue extends Model {
    static associate(models) {
      this.belongsTo(models.Asset, { foreignKey: 'asset_id', as: 'Asset' });
      this.belongsTo(models.User, { foreignKey: 'reported_by', as: 'Reporter' });
      this.belongsTo(models.User, { foreignKey: 'assigned_to', as: 'AssignedUser' });
      this.belongsTo(models.Vendor, { foreignKey: 'vendor_id', as: 'AssignedVendor' });
      this.belongsTo(models.AssetAmc, { foreignKey: 'amc_id', as: 'AMC' });
      // getIssueById includes AssetIssueComment as 'Comments' — this association was missing,
      // so the issue DETAIL query threw "not associated" and returned "issue not found".
      if (models.AssetIssueComment) this.hasMany(models.AssetIssueComment, { foreignKey: 'issue_id', as: 'Comments' });
    }
  }

  AssetIssue.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    issue_type: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    priority: { 
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      defaultValue: 'MEDIUM'
    },
    status: { 
      type: DataTypes.ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'),
      defaultValue: 'OPEN'
    },
    reported_by: { type: DataTypes.INTEGER },
    assigned_to: { type: DataTypes.INTEGER },
    vendor_id: { type: DataTypes.INTEGER },
    resolved_at: { type: DataTypes.DATE },
    remarks: { type: DataTypes.TEXT },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 }
  }, {
    sequelize,
    modelName: 'AssetIssue',
    tableName: 'assetissues',
    freezeTableName: true,
    underscored: false
  });

  return AssetIssue;
};
