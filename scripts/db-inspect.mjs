import { pool, query } from '../server/db.js';

try {
  // Read-only catalog inspection, deliberately excluding credentials and rows.
  const schemas = await query(`SELECT nspname AS schema FROM pg_namespace
    WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname`);
  const tables = await query(`SELECT schemaname AS schema, tablename AS table FROM pg_tables
    WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema'
    ORDER BY schemaname, tablename`);
  console.log(JSON.stringify({ connected: true, schemas: schemas.rows, tables: tables.rows }, null, 2));
} catch (error) {
  console.error('Database inspection failed.', { code: error.code || 'CONNECTION_ERROR' });
  process.exitCode = 1;
} finally {
  await pool.end();
}
