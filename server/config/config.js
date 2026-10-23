require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * SEC-B4 (Sanstark F-30): TLS for the MySQL connection.
 * Opt-in via DB_SSL=true so local dev / docker-compose are untouched.
 * When enabled, the connection verifies the server against the Amazon RDS
 * global CA bundle (server/certs/rds-global-bundle.pem, refreshed from
 * https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem) or a
 * custom bundle at DB_SSL_CA. DB_SSL_REJECT_UNAUTHORIZED defaults to true;
 * set to 'false' ONLY for a throwaway dry-run host, never on prod.
 * Shared by the API, sequelize-cli migrations and the CLI scripts because all
 * three load this file.
 */
function buildDialectOptions() {
  if (String(process.env.DB_SSL || '').toLowerCase() !== 'true') return {};
  const caPath = process.env.DB_SSL_CA || path.join(__dirname, '..', 'certs', 'rds-global-bundle.pem');
  const ssl = {
    rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false'
  };
  try {
    ssl.ca = fs.readFileSync(caPath, 'utf8');
  } catch (e) {
    // Fail loud: a missing bundle with verification on would otherwise surface
    // as an opaque handshake error from mysql2 at first query.
    throw new Error(`DB_SSL=true but CA bundle not readable at ${caPath}: ${e.message}`);
  }
  return { ssl };
}

const dialectOptions = buildDialectOptions();

module.exports = {
  development: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME || 'fams_db_new',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    dialectOptions,
    logging: false
  },
  test: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME_TEST || 'fams_db_test',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    dialectOptions,
    logging: false
  },
  production: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME || 'fams_db_new',
    host: process.env.DB_HOST || 'db',
    port: parseInt(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    dialectOptions,
    logging: false
  }
};
