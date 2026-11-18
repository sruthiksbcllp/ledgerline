'use strict';
const { Model } = require('sequelize');

/** One step of the FDS section 25 period-close checklist for a month, ticked by a named person. */
module.exports = (sequelize, DataTypes) => {
  class R2rCloseTask extends Model {}
  R2rCloseTask.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.STRING(7), allowNull: false },
    task_key: { type: DataTypes.STRING(40), allowNull: false },
    done: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    done_by: { type: DataTypes.INTEGER, allowNull: true },
    done_at: { type: DataTypes.DATE, allowNull: true },
    note: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    sequelize, modelName: 'R2rCloseTask', tableName: 'r2r_close_tasks', freezeTableName: true, underscored: true, timestamps: true
  });
  return R2rCloseTask;
};
