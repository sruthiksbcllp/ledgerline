const { Entity, User, Role } = require('../models');
const { sendResponse } = require('../utils/response');

exports.getAllEntities = async (req, res, next) => {
  try {
    const entities = await Entity.findAll();
    sendResponse(res, 200, entities);
  } catch (error) {
    next(error);
  }
};

exports.createEntity = async (req, res, next) => {
  try {
    const entity = await Entity.create(req.body);
    sendResponse(res, 201, entity, 'New client entity onboarded');
  } catch (error) {
    next(error);
  }
};

exports.updateEntityStatus = async (req, res, next) => {
  try {
    await Entity.update({ status: req.body.status }, {
      where: { id: req.params.id }
    });
    sendResponse(res, 200, null, 'Client status updated');
  } catch (error) {
    next(error);
  }
};
