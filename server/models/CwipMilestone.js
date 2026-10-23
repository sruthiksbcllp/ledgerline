'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CwipMilestone extends Model {
    static associate(models) {
      CwipMilestone.belongsTo(models.CwipProject, { foreignKey: 'project_id', as: 'project' });
    }
  }

  CwipMilestone.init({
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    target_date: { type: DataTypes.DATEONLY, allowNull: true },
    completed_date: { type: DataTypes.DATEONLY, allowNull: true },
    percentage_weight: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, comment: 'Weight in overall % complete' },
    status: {
      type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED'),
      defaultValue: 'PENDING'
    },
    capitalize_on_complete: { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'Trigger capitalization on completion' }
  }, {
    sequelize,
    modelName: 'CwipMilestone',
    tableName: 'cwip_milestones',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return CwipMilestone;
};
