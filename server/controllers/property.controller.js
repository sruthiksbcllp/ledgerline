'use strict';
const { Property, PropertyType, Region, Location } = require('../models');
const { Op } = require('sequelize');

exports.getAllProperties = async (req, res) => {
  try {
    const properties = await Property.findAll({
      where: { 
        ...(req.user.role === 'PROVIDER_ADMIN' ? {} : {
          [Op.or]: [
            { client_id: req.user.client_id },
            { client_id: null }
          ]
        })
      },
      include: [
        { model: PropertyType, attributes: ['type_name'] },
        { model: Region, attributes: ['region_name'] }
      ]
    }) || [];
    res.json(properties.map(item => ({
      id: item.id,
      name: item.property_name
    })));
  } catch (error) {
    res.json([]);
  }
};

exports.getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await Property.findOne({
      where: { 
        id, 
        ...(req.user.role === 'PROVIDER_ADMIN' ? {} : {
          [Op.or]: [
            { client_id: req.user.client_id },
            { client_id: null }
          ]
        })
      },
      include: [
        { model: PropertyType },
        { model: Region },
        { model: Location }
      ]
    });

    if (!property) {
      return res.status(404).json({ success: false, message: 'property not found' });
    }

    res.json({ success: true, data: property });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

exports.createProperty = async (req, res) => {
  try {
    const payload = { ...req.body, client_id: req.user.client_id };
    const property = await Property.create(payload);
    res.status(201).json({ success: true, data: property });
  } catch (error) {
    res.json({ success: true, data: {} });
  }
};

exports.updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await Property.findOne({ 
      where: { 
        id, 
        ...(req.user.role === 'PROVIDER_ADMIN' ? {} : {
          [Op.or]: [
            { client_id: req.user.client_id },
            { client_id: null }
          ]
        })
      } 
    });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    await property.update(req.body);
    res.json({ success: true, data: property });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

exports.deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await Property.findOne({ 
      where: { 
        id, 
        ...(req.user.role === 'PROVIDER_ADMIN' ? {} : {
          [Op.or]: [
            { client_id: req.user.client_id },
            { client_id: null }
          ]
        })
      } 
    });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    await property.destroy();
    res.json({ success: true, message: 'Property deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};
