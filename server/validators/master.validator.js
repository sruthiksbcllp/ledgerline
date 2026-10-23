const { body } = require('express-validator');

exports.categoryValidator = [
  body('category_name').notEmpty().withMessage('Category name is required'),
  body('useful_life').optional().isInt({ min: 1 }).withMessage('Useful life must be a positive integer')
];

exports.departmentValidator = [
  body('dept_name').notEmpty().withMessage('Department name is required'),
  body('dept_code').optional({ nullable: true, checkFalsy: true }).isString().withMessage('Department code must be a string')
];

exports.vendorValidator = [
  body('vendor_name').notEmpty().withMessage('Vendor name is required'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email format'),
  body('gst_number').optional({ nullable: true, checkFalsy: true }).isLength({ min: 15, max: 15 }).withMessage('GST number must be 15 characters'),
  body('pan_number').optional({ nullable: true, checkFalsy: true }).isLength({ min: 10, max: 10 }).withMessage('PAN number must be 10 characters'),
  body('tds_rate_percent').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100 }).withMessage('TDS rate must be between 0 and 100')
];

exports.locationValidator = [
  body('location_name').notEmpty().withMessage('Location name is required'),
  body('location_code').notEmpty().withMessage('Location code is required'),
  body('region_id').isInt().withMessage('Region ID is required')
];
