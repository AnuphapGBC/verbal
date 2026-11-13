import { seedDatabase } from '../server/seed.js';
import { pool } from '../server/db.js';

try {
  console.log(JSON.stringify(await seedDatabase()));
} catch (error) {
  console.error('Database seed failed. No seed changes in this run were committed.', { code: error.code || 'SEED_ERROR' });
  process.exitCode = 1;
} finally {
  await pool.end();
}
