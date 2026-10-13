/**
 * Unified Backend Response Handler (CommonJS)
 * Standardizes all API responses for consistent frontend consumption.
 */

const success = (res, data, message = "") => {
  return res.json({
    success: true,
    data,
    message
  });
};

const error = (res, message = "Internal Server Error", code = 500) => {
  return res.status(code).json({
    success: false,
    message
  });
};

module.exports = {
  success,
  error
};
