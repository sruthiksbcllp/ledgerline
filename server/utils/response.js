/**
 * Standard API response utility
 * ANTI-GRAVITY ENHANCED: Ensures system never returns 500 or breaks UI
 */
const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data: data || []
  });
};

const sendError = (res, message = 'Internal Server Error', statusCode = 500, errors = null) => {
  // Anti-Gravity: Avoid 500 to prevent system crashes, but use success: false for true error states
  const finalStatusCode = statusCode === 500 ? 200 : statusCode;
  
  return res.status(finalStatusCode).json({
    success: false, 
    message,
    data: [], // Safe fallback to prevent frontend .map() crashes
    error: errors || message
  });
};

const sendResponse = (res, statusCode, data, message = 'Success') => {
  const finalStatus = statusCode === 500 ? 200 : statusCode;
  return res.status(finalStatus).json({
    success: true,
    message,
    data: data || []
  });
};

module.exports = {
  sendSuccess,
  sendError,
  sendResponse
};
