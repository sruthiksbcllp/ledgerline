'use strict';
const crypto = require('crypto');

exports.hash = (data) => crypto.createHash('sha256').update(JSON.stringify(data ?? null)).digest('hex');
exports.verify = (data, expectedHash) => exports.hash(data) === expectedHash;

