import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { connectionOptions, pool } from '../server/db.js';

const migrationPool = new pg.Pool(connectionOptions({ direct: true }));
let client;
try {
  client = await migrationPool.connect();
  await client.query('BEGIN');
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('verbal-schema-migrations'))`);
  await client.query('CREATE SCHEMA IF NOT EXISTS verbal');
  await client.query(`CREATE TABLE IF NOT EXISTS verbal.schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(new URL('../server/migrations/', import.meta.url)))
    .filter((name) => /^\d+-[a-z0-9-]+\.sql$/.test(name)).sort();
  const applied = await client.query('SELECT version, checksum FROM verbal.schema_migrations');
  const known = new Map(applied.rows.map((row) => [row.version, row.checksum]));
  const completed = [];
  for (const file of files) {
    const sql = await readFile(new URL(`../server/migrations/${file}`, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (known.has(file)) {
      if (known.get(file) !== checksum) throw Object.assign(new Error('Migration checksum mismatch.'), { code: 'MIGRATION_CHANGED' });
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO verbal.schema_migrations (version, checksum) VALUES ($1, $2)', [file, checksum]);
    completed.push(file);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ migrated: completed, upToDate: completed.length === 0 }));
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error('Database migration failed. No changes in this run were committed.', { code: error.code || 'MIGRATION_ERROR' });
  process.exitCode = 1;
} finally {
  client?.release();
  await migrationPool.end();
  await pool.end();
}
