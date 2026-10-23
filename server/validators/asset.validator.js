const { body } = require('express-validator');

exports.createAssetValidator = [
  body('asset_name').notEmpty().withMessage('Asset name is required'),
  body('category_id').isInt().withMessage('Category ID must be an integer'),
  body('location_id').isInt().withMessage('Location ID must be an integer'),
  body('property_id').isInt().withMessage('Property ID must be an integer'),
  body('purchase_cost').isFloat({ min: 0 }).withMessage('Purchase cost must be a positive number'),
  body('purchase_date').isISO8601().withMessage('Purchase date must be a valid date')
];

exports.updateAssetValidator = [
  body('asset_name').optional().notEmpty().withMessage('Asset name cannot be empty'),
  body('category_id').optional().isInt().withMessage('Category ID must be an integer'),
  body('location_id').optional().isInt().withMessage('Location ID must be an integer'),
  body('purchase_cost').optional().isFloat({ min: 0 }).withMessage('Purchase cost must be a positive number')
];
