'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DepreciationJob extends Model {
    static associate(models) {
      // tenant-scoped via client_id; no hard FK (house pattern)
    }
  }
  DepreciationJob.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    fiscal_year: { type: DataTypes.STRING(9), allowNull: false },
    period_month: { type: DataTypes.INTEGER, allowNull: true },
    job_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MONTHLY' },
    book: { type: DataTypes.STRING(30), allowNull: true, defaultValue: 'ALL' },
    status: { type: DataTypes.ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'), allowNull: false, defaultValue: 'QUEUED' },
    total_assets: { type: DataTypes.INTEGER, allowNull: true },
    processed_assets: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    posted_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skipped_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    source: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'manual' },
    started_at: { type: DataTypes.DATE, allowNull: true },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    heartbeat_at: { type: DataTypes.DATE, allowNull: true },
  }, { sequelize, modelName: 'DepreciationJob', tableName: 'depreciation_jobs', freezeTableName: true, timestamps: true });
  return DepreciationJob;
};
