const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class DirectProcurement extends Model {
    static associate(models) {
      this.belongsTo(models.Vendor, { foreignKey: 'vendor_id' });
      this.hasMany(models.Asset, { foreignKey: 'direct_procurement_id' });
    }
  }

  DirectProcurement.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vendor_id: { type: DataTypes.INTEGER, allowNull: false },
    invoice_number: { type: DataTypes.STRING(100) },
    invoice_date: { type: DataTypes.DATE },
    total_amount: { type: DataTypes.DECIMAL(12, 2) }
  }, {
    sequelize,
    modelName: 'DirectProcurement',
    tableName: 'direct_procurements',
    freezeTableName: true,
    underscored: true
  });

  return DirectProcurement;
};
