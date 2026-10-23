const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class GRNItemSerial extends Model {
    static associate(models) {
      GRNItemSerial.belongsTo(models.GRNItem, { foreignKey: 'grn_item_id' });
    }
  }

  GRNItemSerial.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    grn_item_id: { type: DataTypes.INTEGER, allowNull: false },
    serial_number: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.ENUM('AVAILABLE', 'ASSIGNED', 'REJECTED'), defaultValue: 'AVAILABLE' }
  }, {
    sequelize,
    modelName: 'GRNItemSerial',
    tableName: 'grn_item_serials',
    freezeTableName: true,
    underscored: true
  });

  return GRNItemSerial;
};
