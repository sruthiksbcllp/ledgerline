'use strict';
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const queueFile = path.join(__dirname, '..', 'logs', 'siem-forward.log');

const enabled = () => String(process.env.SIEM_FORWARD_ENABLED || 'false').toLowerCase() === 'true';
const mode = () => String(process.env.SIEM_FORWARD_MODE || 'file').toLowerCase(); // file|webhook

const forward = async (event) => {
  if (!enabled()) return;

  const payload = {
    ts: new Date().toISOString(),
    source: 'fixtag-api',
    event
  };

  try {
    if (mode() === 'webhook' && process.env.SIEM_WEBHOOK_URL) {
      await axios.post(process.env.SIEM_WEBHOOK_URL, payload, { timeout: 4000 });
      return;
    }

    fs.appendFileSync(queueFile, `${JSON.stringify(payload)}\n`);
  } catch (error) {
    // Non-blocking by design
  }
};

module.exports = { forward };
