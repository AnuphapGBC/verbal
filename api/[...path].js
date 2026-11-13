import { attachDatabasePool } from '@vercel/functions';
import { pool } from '../server/db.js';
import { createApp } from '../server/app.js';

// Vercel manages HTTP listeners. Reuse the app and pool across invocations;
// release idle database connections before a Fluid Compute instance suspends.
attachDatabasePool(pool);
const app = createApp();
// Vercel is the trusted proxy in front of this function and supplies the client
// address. Keep per-IP throttles separate for visitors instead of the socket IP.
app.set('trust proxy', 1);
export default app;
