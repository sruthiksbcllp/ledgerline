'use strict';
const { DocumentNumberingConfig } = require('../models');
const { success, error } = require('../utils/responseHandler');
const { getClientId } = require('../utils/tenantFilter');
const { getNextNumber } = require('../services/documentNumbering');
const { sequelize } = require('../models');

exports.getConfigs = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const where = {};
    if (clientId) where.client_id = clientId;
    const configs = await DocumentNumberingConfig.findAll({ where, order: [['document_type', 'ASC']] });
    success(res, configs);
  } catch (e) { next(e); }
};

exports.getConfig = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const config = await DocumentNumberingConfig.findOne({
      where: { id: req.params.id, ...(clientId ? { client_id: clientId } : {}) }
    });
    if (!config) return error(res, 'Configuration not found', 404);
    success(res, config);
  } catch (e) { next(e); }
};

exports.createConfig = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const { document_type, prefix, separator, entity_code, include_fy, fy_format,
            fy_start_month, sequence_padding, sequence_start, reset_sequence,
            include_location, include_entity, include_department } = req.body;

    if (!document_type || !prefix) return error(res, 'document_type and prefix are required', 400);

    // Deactivate any existing config for same client+docType
    await DocumentNumberingConfig.update(
      { is_active: false },
      { where: { client_id: clientId || req.body.client_id, document_type } }
    );

    const config = await DocumentNumberingConfig.create({
      client_id: clientId || req.body.client_id,
      document_type, prefix,
      separator: separator || '-',
      entity_code: entity_code || null,
      include_fy: include_fy !== undefined ? include_fy : true,
      include_location: include_location !== undefined ? include_location : false,
      include_entity: include_entity !== undefined ? include_entity : false,
      include_department: include_department !== undefined ? include_department : false,
      fy_format: fy_format || 'YYYY',
      fy_start_month: fy_start_month || 1,
      sequence_padding: sequence_padding || 4,
      sequence_start: sequence_start || 1,
      reset_sequence: reset_sequence || 'YEARLY',
      is_active: true
    });
    success(res, config, 201);
  } catch (e) { next(e); }
};

exports.updateConfig = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const config = await DocumentNumberingConfig.findOne({
      where: { id: req.params.id, ...(clientId ? { client_id: clientId } : {}) }
    });
    if (!config) return error(res, 'Configuration not found', 404);

    const { prefix, separator, entity_code, include_fy, fy_format,
            fy_start_month, sequence_padding, sequence_start, reset_sequence,
            include_location, include_entity, include_department } = req.body;

    await config.update({
      ...(prefix !== undefined && { prefix }),
      ...(separator !== undefined && { separator }),
      ...(entity_code !== undefined && { entity_code }),
      ...(include_location !== undefined && { include_location }),
      ...(include_entity !== undefined && { include_entity }),
      ...(include_department !== undefined && { include_department }),
      ...(include_fy !== undefined && { include_fy }),
      ...(fy_format !== undefined && { fy_format }),
      ...(fy_start_month !== undefined && { fy_start_month }),
      ...(sequence_padding !== undefined && { sequence_padding }),
      ...(sequence_start !== undefined && { sequence_start }),
      ...(reset_sequence !== undefined && { reset_sequence }),
    });
    success(res, config);
  } catch (e) { next(e); }
};

exports.deleteConfig = async (req, res, next) => {
  try {
    const clientId = getClientId(req);
    const config = await DocumentNumberingConfig.findOne({
      where: { id: req.params.id, ...(clientId ? { client_id: clientId } : {}) }
    });
    if (!config) return error(res, 'Configuration not found', 404);
    await config.update({ is_active: false });
    success(res, { message: 'Configuration deactivated' });
  } catch (e) { next(e); }
};

exports.previewNumber = async (req, res, next) => {
  try {
    const clientId = getClientId(req) || req.body.client_id;
    const { document_type } = req.body;
    if (!clientId || !document_type) return error(res, 'client_id and document_type required', 400);

    // Generate a preview without actually incrementing — use a savepoint + rollback
    const transaction = await sequelize.transaction();
    try {
      const preview = await getNextNumber(clientId, document_type, transaction);
      await transaction.rollback(); // Don't actually consume the number
      success(res, { preview });
    } catch (e) {
      if (!transaction.finished) await transaction.rollback();
      throw e;
    }
  } catch (e) { next(e); }
};
