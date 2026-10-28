'use strict';

const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];

function run(cwd, args, name) {
  const child = spawn(npm, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  child.on('exit', (code, signal) => {
    if (signal || shuttingDown) return;
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.pid || child.killed) continue;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// The local MySQL here is not a Windows service, so it is down after every restart and the login
// page shows "connect ECONNREFUSED 127.0.0.1:3306". Start it first when it isn't already listening.
// Override the paths with MYSQLD_PATH / MYSQL_DEFAULTS_FILE; set SKIP_MYSQL_START=1 to turn this off.
const fs = require('fs');
const net = require('net');
const MYSQLD = process.env.MYSQLD_PATH || 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe';
const MYSQL_INI = process.env.MYSQL_DEFAULTS_FILE || 'D:\\mysql-data\\my.ini';
const DB_PORT = Number(process.env.DB_PORT || 3306);

const portOpen = (port) => new Promise((resolve) => {
  const socket = net.connect({ port, host: '127.0.0.1' });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
  socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
});

async function ensureMysql() {
  if (process.env.SKIP_MYSQL_START || process.platform !== 'win32') return;
  if (await portOpen(DB_PORT)) return;
  if (!fs.existsSync(MYSQLD) || !fs.existsSync(MYSQL_INI)) {
    console.warn(`MySQL is not running on port ${DB_PORT} and ${MYSQLD} / ${MYSQL_INI} was not found - start it yourself.`);
    return;
  }
  console.log('Starting local MySQL...');
  // Detached, so it keeps running after this dev session stops (like a service would).
  spawn(MYSQLD, [`--defaults-file=${MYSQL_INI}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 30; i += 1) {
    if (await portOpen(DB_PORT)) { console.log('MySQL is up.'); return; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn('MySQL did not start within 30 seconds; the API will retry when it connects.');
}

ensureMysql().finally(() => {
  run(path.join(root, 'server'), ['start'], 'API');
  run(path.join(root, 'client'), ['run', 'dev'], 'client');
});
