import 'dotenv/config';
import pg from 'pg';

// The browser never imports this module. Both URLs remain server-only.
export function connectionOptions({ direct = false } = {}) {
  const value = direct
    ? process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
    : process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required. Configure the server .env file.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  if (direct && !process.env.DIRECT_DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    url.hostname = url.hostname.replace('-pooler.', '.');
  }
  // node-postgres verifies the certificate and hostname for hosted TLS connections.
  if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode', 'verify-full');
  return {
    connectionString: url.toString(),
    enableChannelBinding: true,
    max: direct ? 1 : 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 15_000,
    application_name: direct ? 'verbal-migrations' : 'verbal-app',
  };
}

export const pool = new pg.Pool(connectionOptions());
pool.on('error', (error) => {
  // PostgreSQL error text can contain connection details or submitted values.
  console.error('Database pool connection error', { code: error.code || 'CONNECTION_ERROR' });
});

export const query = (text, params) => pool.query(text, params);

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
