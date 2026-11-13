import { createServer } from 'vite';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';

let frontend;
let api;
let stopping=false;
async function stop(code=0){
  if(stopping)return;stopping=true;
  await frontend?.close();
  if(api) { api.closeAllConnections(); await new Promise(resolve=>api.close(resolve)); }
  await pool.end();
  process.exit(code);
}
try {
  await pool.query('SELECT 1 FROM verbal.schema_migrations LIMIT 1');
  const port=Number(process.env.PORT)||3001;
  api=createApp().listen(port,'127.0.0.1');
  api.on('error',error=>{console.error('API could not start',{code:error.code||'SERVER_ERROR'});stop(1)});
  frontend=await createServer({server:{port:5173,strictPort:true}});
  await frontend.listen();
  console.log(`Verbal API: http://127.0.0.1:${port}`);
  frontend.printUrls();
} catch(error) {
  console.error('Development server could not start. Check .env, run npm run db:migrate, and ensure ports 3001/5173 are available.',{code:error.code||'STARTUP_ERROR'});
  await stop(1);
}
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
