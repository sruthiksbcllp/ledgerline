const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Budget extends Model {
    static associate(models) {
      this.belongsTo(models.Department, { foreignKey: 'department_id' });
      this.belongsTo(models.AssetCategory, { foreignKey: 'category_id' });
    }
  }

  Budget.init({
    financial_year: { type: DataTypes.STRING(10), allowNull: false },
    allocated_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    utilized_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'Budget',
    tableName: 'budgets',
    freezeTableName: true
  });

  return Budget;
};
