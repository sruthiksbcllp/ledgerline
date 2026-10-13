'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AlertAction extends Model {
    static associate(models) {
      AlertAction.belongsTo(models.Alert, { foreignKey: 'alert_id' });
      AlertAction.belongsTo(models.User, { foreignKey: 'performed_by', as: 'Performer' });
    }
  }
  AlertAction.init({
    alert_id: { type: DataTypes.INTEGER, allowNull: false },
    action_type: {
      type: DataTypes.ENUM('ASSIGNED', 'COMMENTED', 'STATUS_CHANGE', 'ESCALATED'),
      allowNull: false
    },
    performed_by: { type: DataTypes.INTEGER, allowNull: false },
    comments: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'AlertAction',
    tableName: 'alert_actions',
    freezeTableName: true,
    underscored: true,
    updatedAt: false
  });
  return AlertAction;
};
