'use strict';

/**
 * Who is acting in the current request, available anywhere down the call chain (controllers,
 * services, Sequelize hooks) without passing `req` around. verifyToken opens the context for
 * signed-in users; other entry points (email-link approvals, scheduled jobs) can open their own.
 *
 *   actor: { user_id, role_code, user_name?, role_name? }
 *   request: { method, path, body } - used to name the action (approve / reject / cancel ...)
 */
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

const run = (ctx, fn) => storage.run(ctx, fn);
const current = () => storage.getStore() || null;

/** Context for a signed-in API request. The body is read lazily: multipart routes parse it later. */
const fromRequest = (req) => ({
  actor: { user_id: req.user?.id || null, role_code: req.user?.role || null, client_id: req.user?.client_id || null },
  request: {
    method: req.method,
    path: String(req.originalUrl || req.url || '').split('?')[0],
    get body() { return req.body; }
  }
});

module.exports = { run, current, fromRequest };
