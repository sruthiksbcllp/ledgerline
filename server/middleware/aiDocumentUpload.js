'use strict';

/**
 * Accepts one PDF/image (field "file", max 10 MB) in memory for AI extraction.
 * Files are never written to disk. Upload problems answer with the same JSON shape
 * as extraction errors: { success: false, code, message }.
 */
const multer = require('multer');
const { ExtractionError, SUPPORTED_TYPES } = require('../services/vendorExtraction.service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_TYPES.includes(file.mimetype)) return cb(null, true);
    return cb(new ExtractionError('Unsupported file. Upload a PDF, JPG, PNG, GIF or WEBP file.', 415, 'UNSUPPORTED_FILE'));
  }
}).single('file');

const aiDocumentUpload = (req, res, next) => {
  upload(req, res, (error) => {
    if (!error && req.file) return next();
    let err = error;
    if (!err) err = new ExtractionError('Choose a file to upload.', 400, 'NO_FILE');
    else if (err.code === 'LIMIT_FILE_SIZE') err = new ExtractionError('File is larger than 10 MB.', 413, 'FILE_TOO_LARGE');
    else if (!(err instanceof ExtractionError)) err = new ExtractionError('Upload failed.', 400, 'UPLOAD_FAILED');
    return res.status(err.status).json({ success: false, code: err.code, message: err.message });
  });
};

module.exports = { aiDocumentUpload };
