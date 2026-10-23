const { Item, AssetCategory, AssetSubCategory, InventoryBalance, Location, Client } = require('../models');
const { buildWhere, getClientId } = require('../utils/tenantFilter');
const { sendResponse } = require('../utils/response');

exports.getAllItems = async (req, res) => {
  try {
    const items = await Item.findAll({
      where: { item_type: 'INVENTORY', ...buildWhere(req) },
      include: [
        { model: AssetCategory, attributes: ['category_name'] },
        { model: AssetSubCategory, attributes: ['sub_category_name'] }
      ]
    });
    res.json({ success: true, count: items.length, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load inventory items' });
  }
};

exports.getAssetItems = async (req, res) => {
  try {
    const items = await Item.findAll({
      where: { item_type: 'FIXED_ASSET', ...buildWhere(req) },
      include: [
        { model: AssetCategory, attributes: ['category_name'] },
        { model: AssetSubCategory, attributes: ['sub_category_name'] }
      ]
    });
    res.json({ success: true, count: items.length, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};


exports.getItemById = async (req, res) => {
  try {
    const item = await Item.findOne({
      where: { id: req.params.id, ...buildWhere(req) },
      include: [
        { model: AssetCategory, attributes: ['category_name'] },
        { model: AssetSubCategory, attributes: ['sub_category_name'] },
        { 
          model: InventoryBalance, 
          include: [{ model: Location, attributes: ['location_name'] }]
        }
      ]
    });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

exports.createItem = async (req, res) => {
  try {
    let clientId = null;
    try {
      clientId = getClientId(req);
    } catch {
      clientId = null;
    }

    if (!clientId && req.body?.client_id) {
      clientId = Number(req.body.client_id) || null;
    }

    if (!clientId && req.user?.client_id) {
      clientId = Number(req.user.client_id) || null;
    }

    if (!clientId) {
      const fallbackClient = await Client.findOne({ attributes: ['id'], order: [['id', 'ASC']] });
      clientId = fallbackClient?.id || null;
    }

    if (!clientId) {
      return res.status(400).json({ success: false, message: 'Unable to resolve client context for item creation' });
    }

    const item = await Item.create({
      ...req.body,
      client_id: clientId
    });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'SKU code already exists for this client' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const item = await Item.findOne({
      where: { id: req.params.id, ...buildWhere(req) }
    });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    await item.update(req.body);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const item = await Item.findOne({
      where: { id: req.params.id, ...buildWhere(req) }
    });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    
    // Check if item has transactions
    const { StockTransaction } = require('../models');
    const transCount = await StockTransaction.count({ where: { item_id: req.params.id } });
    if (transCount > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete item with transaction history' });
    }

    await item.destroy();
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};
