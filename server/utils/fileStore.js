'use strict';

/**
 * Where uploaded files live.
 *
 * Files are always written to UPLOAD_DIR first (multer disk storage). On hosts whose disk is wiped
 * on restart (e.g. Render free) each upload is also copied to durable storage, and /uploads falls
 * back to it for files that are no longer on local disk. STORAGE_DRIVER picks the durable store:
 *
 *   db  - the app's MySQL database (table stored_files). No extra service needed.
 *   s3  - an S3-compatible bucket (Amazon S3, Cloudflare R2, Backblaze B2):
 *           STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY,
 *           STORAGE_ENDPOINT (omit for Amazon S3), STORAGE_REGION ('auto' for R2)
 *   unset - 's3' when the bucket settings are present, otherwise local disk only.
 */
const fs = require('fs');
const path = require('path');

const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
const bucketConfigured = () => Boolean(process.env.STORAGE_BUCKET && process.env.STORAGE_ACCESS_KEY_ID && process.env.STORAGE_SECRET_ACCESS_KEY);

/** 'db' | 's3' | null (local disk only). */
function driver() {
  const d = String(process.env.STORAGE_DRIVER || '').trim().toLowerCase();
  if (d === 'db') return 'db';
  if (d === 's3') return bucketConfigured() ? 's3' : null;
  return bucketConfigured() ? 's3' : null;
}
const enabled = () => driver() !== null;

let client = null;
function s3() {
  if (!client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    client = new S3Client({
      region: process.env.STORAGE_REGION || 'auto',
      ...(process.env.STORAGE_ENDPOINT ? { endpoint: process.env.STORAGE_ENDPOINT } : {}),
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY
      }
    });
  }
  return client;
}

/** Storage key for a file under UPLOAD_DIR, e.g. "invoices/123-bill.pdf". Null if outside it. */
function keyFor(absPath) {
  const rel = path.relative(uploadRoot(), path.resolve(absPath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Copies a file multer just saved (req.file) to durable storage. No-op when there is none.
 * Throws if the copy fails, so the request can report it instead of silently keeping a file that
 * would vanish on the next restart.
 */
async function persistUpload(file) {
  const d = driver();
  if (!d || !file || !file.path) return;
  const key = keyFor(file.path);
  if (!key) return;
  const mime = file.mimetype || 'application/octet-stream';
  if (d === 'db') {
    const { StoredFile } = require('../models');
    const content = await fs.promises.readFile(file.path);
    await StoredFile.upsert({ storage_key: key, content, mime_type: mime, size: content.length });
    return;
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await s3().send(new PutObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: key,
    Body: fs.createReadStream(file.path),
    ContentLength: file.size,
    ContentType: mime
  }));
}

/** Reads a stored file: { body: Buffer | Readable, contentType, length } or null if not found. */
async function readStored(key) {
  if (driver() === 'db') {
    const { StoredFile } = require('../models');
    const row = await StoredFile.findOne({ where: { storage_key: key } });
    return row ? { body: row.content, contentType: row.mime_type, length: row.size } : null;
  }
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  try {
    const obj = await s3().send(new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }));
    return { body: obj.Body, contentType: obj.ContentType, length: obj.ContentLength };
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** Express middleware for /uploads: serves files missing from local disk out of durable storage. */
function bucketFallback(req, res, next) {
  if (!enabled() || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
  let key;
  try { key = decodeURIComponent(req.path).replace(/^\/+/, ''); } catch { return next(); }
  if (!key || key.split('/').some((part) => part === '..' || part === '')) return next();
  readStored(key)
    .then((file) => {
      if (!file) return next();
      if (file.contentType) res.setHeader('Content-Type', file.contentType);
      if (file.length != null) res.setHeader('Content-Length', file.length);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      if (req.method === 'HEAD') return res.end();
      if (Buffer.isBuffer(file.body)) return res.end(file.body);
      file.body.on('error', next);
      file.body.pipe(res);
    })
    .catch(next);
}

module.exports = { enabled, driver, persistUpload, bucketFallback, uploadRoot };
