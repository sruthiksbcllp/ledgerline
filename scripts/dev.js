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

run(path.join(root, 'server'), ['start'], 'API');
run(path.join(root, 'client'), ['run', 'dev'], 'client');
