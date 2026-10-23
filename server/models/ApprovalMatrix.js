const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ApprovalMatrix extends Model {
    static associate(models) {
      ApprovalMatrix.belongsTo(models.ApprovalWorkflow, { foreignKey: 'workflow_id' });
    }
  }

  ApprovalMatrix.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    workflow_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    module_name: { type: DataTypes.STRING },
    level: { type: DataTypes.INTEGER, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false },
    role_code: { type: DataTypes.STRING },
    min_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    max_amount: { type: DataTypes.DECIMAL(15, 2) },
    threshold_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    mode: { type: DataTypes.ENUM('LINE', 'COLLECTIVE'), defaultValue: 'COLLECTIVE' },
    is_mandatory: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'ApprovalMatrix',
    tableName: 'approval_matrix',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });

  return ApprovalMatrix;
};
