'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Request extends Model {
    static associate(models) {
      Request.belongsTo(models.User,       { foreignKey: 'created_by', as: 'Requestor' });
      Request.belongsTo(models.User,       { foreignKey: 'manager_id', as: 'Manager' });
      Request.belongsTo(models.Department, { foreignKey: 'department_id' });
      Request.belongsTo(models.Property,   { foreignKey: 'property_id' });
      Request.hasMany(models.RequestItem,  { foreignKey: 'request_id', as: 'items' });
      Request.hasMany(models.RequestApprovalTrail, { foreignKey: 'request_id' });
    }
  }

  Request.init({
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    request_number:  { type: DataTypes.STRING, unique: true },
    request_type: {
      type: DataTypes.ENUM('PURCHASE', 'TRANSFER', 'DISPOSAL', 'ISSUE', 'MAINTENANCE',
                           'NEW', 'REFILL', 'SPARE_PART', 'REPAIR', 'REPLACEMENT', 'OTHER'),
      allowNull: false
    },
    created_by:             { type: DataTypes.INTEGER },
    manager_id:             { type: DataTypes.INTEGER },
    department_id:          { type: DataTypes.INTEGER },
    property_id:            { type: DataTypes.INTEGER },
    asset_id:               { type: DataTypes.INTEGER },
    request_description:    { type: DataTypes.TEXT },
    request_reason:         { type: DataTypes.TEXT },
    remarks:                { type: DataTypes.TEXT },
    total_items:            { type: DataTypes.INTEGER, defaultValue: 0 },
    total_estimated_value:  { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'PROCESSED', 'PENDING', 'PENDING_CONFIGURATION'),
      defaultValue: 'DRAFT'
    },
    workflow_id:            { type: DataTypes.INTEGER },
    current_level:          { type: DataTypes.INTEGER, defaultValue: 0 },
    current_approval_level: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_approval_levels:  { type: DataTypes.INTEGER, defaultValue: 0 },
    is_fully_approved:      { type: DataTypes.BOOLEAN, defaultValue: false },
    converted_to_id:        { type: DataTypes.INTEGER },
    converted_to_type:      { type: DataTypes.STRING }
  }, {
    sequelize,
    modelName: 'Request',
    tableName: 'requests',
    freezeTableName: true,
    timestamps: true,
    underscored: false
  });

  return Request;
};
