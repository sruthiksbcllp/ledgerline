const path = require('path');

/**
 * Enterprise File Security Middleware
 * Validates file types and sizes to prevent malicious uploads
 */
exports.validateUpload = (req, res, next) => {
  if (!req.file) return next();

  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx'];
  const maxFileSize = 10 * 1024 * 1024; // 10MB

  const fileExt = path.extname(req.file.originalname).toLowerCase();
  
  // 1. Extension Validation
  if (!allowedExtensions.includes(fileExt)) {
    return res.status(400).json({ 
      success: false, 
      message: `Unsupported file type. Allowed: ${allowedExtensions.join(', ')}` 
    });
  }

  // 2. Size Validation
  if (req.file.size > maxFileSize) {
    return res.status(400).json({ 
      success: false, 
      message: 'File size too large. Maximum allowed is 10MB.' 
    });
  }

  next();
};
