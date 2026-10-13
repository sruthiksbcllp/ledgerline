const winston = require('winston');
const { sendError } = require('../utils/response');

// Configure Winston Logger
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error
  logger.error(`${statusCode} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip} - Stack: ${err.stack}`);

  // Send standardized error response
  return sendError(
    res, 
    message, 
    statusCode, 
    process.env.NODE_ENV === 'development' ? err.stack : null
  );
};

module.exports = {
  errorHandler,
  logger
};
