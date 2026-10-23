const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ApprovalWorkflow extends Model {
    static associate(models) {
      ApprovalWorkflow.hasMany(models.ApprovalMatrix, { foreignKey: 'workflow_id', as: 'matrix' });
    }
  }

  ApprovalWorkflow.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    module: { type: DataTypes.STRING, allowNull: false }, // e.g., 'PR'
    client_id: { type: DataTypes.INTEGER },
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
    approval_topology: {
      type: DataTypes.ENUM('COLLECTIVE', 'LINE_LEVEL'),
      defaultValue: 'COLLECTIVE'
    },
    progression_mode: {
      type: DataTypes.ENUM('COLLECTIVE', 'PER_LINE'),
      defaultValue: 'COLLECTIVE'
    }
  }, {
    sequelize,
    modelName: 'ApprovalWorkflow',
    tableName: 'approval_workflows',
    freezeTableName: true,
    underscored: true
  });

  return ApprovalWorkflow;
};
