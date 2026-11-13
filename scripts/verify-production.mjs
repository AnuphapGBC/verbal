import assert from 'node:assert/strict';
import { once } from 'node:events';
process.env.NODE_ENV='production';
process.env.APP_ORIGIN='https://verbal.example';
const { default: app }=process.argv.includes('--vercel')
  ? await import('../api/index.js')
  : {default:(await import('../server/app.js')).createApp()};
const { pool }=await import('../server/db.js');
const server=app.listen(0,'127.0.0.1');
await once(server,'listening');
try {
  const base=`http://127.0.0.1:${server.address().port}`;
  const home=await fetch(base);
  assert.equal(home.status,200);
  assert.match(home.headers.get('content-security-policy'),/default-src 'self'/);
  assert.match(home.headers.get('strict-transport-security'),/max-age=/);
  assert.equal(home.headers.get('x-content-type-options'),'nosniff');
  assert.equal(home.headers.get('x-frame-options'),'SAMEORIGIN');
  const html=await home.text();
  assert.match(html,/Verbal/);
  const script=html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
  const asset=await fetch(`${base}${script}`);
  assert.equal(asset.status,200);
  assert.doesNotMatch(await asset.text(),/npg_|neondb_owner|postgresql:\/\//);
  const health=await fetch(`${base}/api/health`);
  assert.equal(health.status,200);
  assert.equal((await health.json()).database,'connected');
  // A one-segment health check alone missed a deployed nested-route 404.
  // Verify a nested POST reaches auth validation without submitting credentials.
  const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{Origin:'https://verbal.example','Content-Type':'application/json'},body:'{}'});
  assert.equal(login.status,422);
  assert.match(login.headers.get('content-type'),/application\/json/);
  assert.ok((await login.json()).error);
  const unknown=await fetch(`${base}/api/not-an-endpoint`);
  assert.equal(unknown.status,404);
  assert.equal((await unknown.json()).error,'API endpoint not found.');
  const blocked=await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{Origin:'https://untrusted.example'}});
  assert.equal(blocked.status,403);
  console.log('PASS: production static assets, database health, security headers, origin guard, and credential isolation.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  await pool.end();
}
