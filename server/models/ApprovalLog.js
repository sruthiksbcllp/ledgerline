const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ApprovalLog extends Model {
    static associate(models) {
      ApprovalLog.belongsTo(models.User, { foreignKey: 'user_id' });
    }
  }

  ApprovalLog.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    module: { type: DataTypes.STRING, allowNull: false },
    reference_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    action: {
      type: DataTypes.ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'UPDATED', 'ESCALATED', 'CONFIGURATION_REQUIRED'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'ESCALATED', 'PENDING_CONFIGURATION'),
      defaultValue: 'SUBMITTED'
    },
    level: { type: DataTypes.INTEGER, defaultValue: 1 },
    line_item_id: { type: DataTypes.INTEGER, allowNull: true },
    approval_topology: {
      type: DataTypes.ENUM('COLLECTIVE', 'LINE_LEVEL'),
      defaultValue: 'COLLECTIVE'
    },
    progression_mode: {
      type: DataTypes.ENUM('COLLECTIVE', 'PER_LINE'),
      defaultValue: 'COLLECTIVE'
    },
    role_code: { type: DataTypes.STRING },
    comments: { type: DataTypes.TEXT },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    // FT-003/FT-004 Batch 0 — tenant + workflow attribution (additive, nullable)
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    workflow_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    modelName: 'ApprovalLog',
    tableName: 'approval_logs',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });

  return ApprovalLog;
};
