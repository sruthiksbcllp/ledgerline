'use strict';
/**
 * Evidence for an AR credit note or write-off (photos of damage, bankruptcy filing, emails): one
 * PDF / JPG / PNG of up to 10 MB in field "file", saved under uploads/ar-evidence and copied to the
 * durable store (database or bucket) so it survives a restart. The file is optional here; the
 * controller decides whether the step needs it. Form fields arrive as text (JSON for "lines").
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { persistUpload } = require('../utils/fileStore');

const dir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'), 'ar-evidence');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => cb(null, `ar-ev-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname || '').toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (TYPES.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only PDF, JPG or PNG files can be attached')))
}).single('file');

const arEvidenceUpload = (req, res, next) => upload(req, res, async (error) => {
  if (error) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 10 MB' : error.message || 'Upload failed';
    return res.status(400).json({ success: false, message });
  }
  if (req.file) {
    try {
      await persistUpload(req.file);
      req.evidence = { url: `/uploads/ar-evidence/${req.file.filename}`, name: String(req.file.originalname || req.file.filename).slice(0, 255) };
    } catch (e) {
      return res.status(500).json({ success: false, message: 'The file could not be stored. Try again.' });
    }
  }
  return next();
});

module.exports = { arEvidenceUpload };
