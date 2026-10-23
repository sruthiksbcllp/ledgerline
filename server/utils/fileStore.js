'use strict';

/**
 * Where uploaded files live.
 *
 * Files are always written to UPLOAD_DIR first (multer disk storage). When an S3-compatible bucket
 * is configured (Cloudflare R2 now, Amazon S3 later) each upload is also copied there, and
 * /uploads falls back to the bucket for files that are not on local disk, so uploads survive
 * restarts and redeploys on hosts without a persistent disk (e.g. Render free).
 *
 *   STORAGE_BUCKET             bucket name                (required to turn this on)
 *   STORAGE_ENDPOINT           https://<account>.r2.cloudflarestorage.com (omit for Amazon S3)
 *   STORAGE_REGION             'auto' for R2, e.g. 'ap-south-1' for S3 (default 'auto')
 *   STORAGE_ACCESS_KEY_ID      access key
 *   STORAGE_SECRET_ACCESS_KEY  secret key
 */
const fs = require('fs');
const path = require('path');

const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
const enabled = () => Boolean(process.env.STORAGE_BUCKET && process.env.STORAGE_ACCESS_KEY_ID && process.env.STORAGE_SECRET_ACCESS_KEY);

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

/** Bucket key for a file under UPLOAD_DIR, e.g. "invoices/123-bill.pdf". Null if outside it. */
function keyFor(absPath) {
  const rel = path.relative(uploadRoot(), path.resolve(absPath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Copies a file multer just saved (req.file) to the bucket. No-op when storage is not configured.
 * Throws if the copy fails, so the request can report it instead of silently keeping a file that
 * would vanish on the next restart.
 */
async function persistUpload(file) {
  if (!enabled() || !file || !file.path) return;
  const key = keyFor(file.path);
  if (!key) return;
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await s3().send(new PutObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: key,
    Body: fs.createReadStream(file.path),
    ContentLength: file.size,
    ContentType: file.mimetype || 'application/octet-stream'
  }));
}

/** Express middleware for /uploads: serves files missing from local disk out of the bucket. */
function bucketFallback(req, res, next) {
  if (!enabled() || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
  let key;
  try { key = decodeURIComponent(req.path).replace(/^\/+/, ''); } catch { return next(); }
  if (!key || key.split('/').some((part) => part === '..' || part === '')) return next();
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  s3().send(new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }))
    .then((obj) => {
      if (obj.ContentType) res.setHeader('Content-Type', obj.ContentType);
      if (obj.ContentLength != null) res.setHeader('Content-Length', obj.ContentLength);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      if (req.method === 'HEAD') return res.end();
      obj.Body.on('error', next);
      obj.Body.pipe(res);
    })
    .catch((err) => (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404 ? next() : next(err)));
}

module.exports = { enabled, persistUpload, bucketFallback, uploadRoot };
