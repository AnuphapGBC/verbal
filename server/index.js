import { createApp } from './app.js';
import { pool } from './db.js';
const port=Number(process.env.PORT)||3001;
const app=createApp();
try {
  await pool.query('SELECT 1 FROM verbal.schema_migrations LIMIT 1');
  const server=app.listen(port,process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1',()=>{
    console.log(`Verbal API ready at http://127.0.0.1:${port}`);
  });
  const cleanup=setInterval(async()=>{
    try{
      await pool.query('DELETE FROM verbal.sessions WHERE expires_at<NOW()');
      await pool.query('DELETE FROM verbal.login_attempts WHERE reset_at<NOW()');
    }catch(error){console.error('Maintenance failed',{code:error.code||'DB_ERROR'})}
  },3600000).unref();
  async function stop(){clearInterval(cleanup);server.close(async()=>{await pool.end();process.exit(0)});}
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  server.on('error',error=>{console.error('Server could not start',{code:error.code||'SERVER_ERROR'});pool.end();process.exitCode=1});
}catch(error){console.error('Database is not ready. Run npm run db:migrate first.',{code:error.code||'DB_ERROR'});await pool.end();process.exitCode=1;}
