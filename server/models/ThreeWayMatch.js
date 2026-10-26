const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ThreeWayMatch extends Model {
    static associate(models) {
      this.belongsTo(models.Invoice, { foreignKey: 'invoice_id' });
      this.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      this.belongsTo(models.GRN, { foreignKey: 'grn_id' });
      this.belongsTo(models.ServiceEntrySheet, { foreignKey: 'ses_id' });
    }
  }

  ThreeWayMatch.init({
    po_id: { type: DataTypes.INTEGER, allowNull: false },
    grn_id: { type: DataTypes.INTEGER, allowNull: true },
    ses_id: { type: DataTypes.INTEGER, allowNull: true }, // service receipt matched instead of a GRN
    invoice_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('MATCHED', 'TOLERANCE_BREACH', 'BLOCKED', 'PENDING'), allowNull: false, defaultValue: 'PENDING' },
    qty_variance: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    amount_variance: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    tolerance_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    blocked_reason: { type: DataTypes.TEXT }
  }, {
    sequelize,
    modelName: 'ThreeWayMatch',
    tableName: 'three_way_matches',
    underscored: true
  });

  return ThreeWayMatch;
};

