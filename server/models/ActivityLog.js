'use strict';
const { Model } = require('sequelize');
const crypto = require('crypto');

const stableStringify = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    try {
      return stableStringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const hashPayload = (entry) => {
  const payload = {
    previous_hash: entry.previous_hash || null,
    user_id: entry.user_id || null,
    actor_role: entry.actor_role || null,
    action: entry.action,
    module: entry.module,
    record_id: entry.record_id || null,
    description: entry.description || '',
    old_values: stableStringify(entry.old_values),
    new_values: stableStringify(entry.new_values),
    metadata: stableStringify(entry.metadata),
    client_id: entry.client_id || null,
    ip_address: entry.ip_address || null,
    request_method: entry.request_method || null,
    request_path: entry.request_path || null,
    user_agent: entry.user_agent || null,
    createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null
  };
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
};

module.exports = (sequelize, DataTypes) => {
  class ActivityLog extends Model {
    static associate(models) {
      ActivityLog.belongsTo(models.User, { foreignKey: 'user_id' });
    }
  }
  ActivityLog.init({
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.STRING(100), allowNull: false },
    module: { type: DataTypes.STRING(100), allowNull: false },
    record_id: DataTypes.INTEGER,
    description: DataTypes.TEXT,
    old_values: DataTypes.JSON,
    new_values: DataTypes.JSON,
    ip_address: DataTypes.STRING(45),
    client_id: DataTypes.INTEGER,
    actor_role: DataTypes.STRING(100),
    request_method: DataTypes.STRING(20),
    request_path: DataTypes.STRING(255),
    user_agent: DataTypes.STRING(255),
    metadata: DataTypes.JSON,
    previous_hash: DataTypes.STRING(64),
    entry_hash: DataTypes.STRING(64)
  }, {
    sequelize,
    modelName: 'ActivityLog',
    tableName: 'activitylogs',
    freezeTableName: true,
    timestamps: true,
    updatedAt: false,
    hooks: {
      beforeCreate: async (log) => {
        if (!log.createdAt) log.createdAt = new Date();
        if (!log.previous_hash) {
          const previous = await ActivityLog.findOne({
            attributes: ['entry_hash'],
            order: [['id', 'DESC']]
          });
          log.previous_hash = previous?.entry_hash || null;
        }
        log.entry_hash = hashPayload(log.get({ plain: true }));
      },
      beforeUpdate: () => {
        throw new Error('Activity logs are immutable and cannot be updated');
      },
      beforeDestroy: () => {
        throw new Error('Activity logs are immutable and cannot be deleted');
      }
    }
  });
  return ActivityLog;
};
