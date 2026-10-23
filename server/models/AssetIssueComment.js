'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetIssueComment extends Model {
    static associate(models) {
      AssetIssueComment.belongsTo(models.AssetIssue, { foreignKey: 'issue_id' });
      AssetIssueComment.belongsTo(models.User, { foreignKey: 'user_id', as: 'Author' });
    }
  }
  AssetIssueComment.init({
    issue_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    comment: { type: DataTypes.TEXT, allowNull: false }
  }, {
    sequelize,
    modelName: 'AssetIssueComment',
    tableName: 'assetissuecomments',
    freezeTableName: true,
    timestamps: true,
  });
  return AssetIssueComment;
};
